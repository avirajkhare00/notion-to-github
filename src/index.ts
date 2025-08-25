import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { NotionToGitHubConverter } from './converter';
import { ConversionConfig } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper: build converter from env if not provided in body
function buildConverterFromEnv() {
  const notionApiKey = process.env.NOTION_API_KEY || '';
  const githubToken = process.env.GITHUB_TOKEN || '';
  const githubRepoOwner = process.env.GITHUB_REPO_OWNER || '';
  const githubRepoName = process.env.GITHUB_REPO_NAME || '';
  const githubBranch = process.env.GITHUB_BRANCH || 'main';
  const outputPath = process.env.OUTPUT_PATH || 'content/posts';

  const config: ConversionConfig = {
    notionDatabaseId: '', // Not needed for webhook single-page operations
    githubRepoOwner,
    githubRepoName,
    githubBranch,
    outputPath,
  };

  return { converter: new NotionToGitHubConverter(notionApiKey, githubToken, config), config };
}

// Convert and push all pages
app.post('/api/convert', async (req, res) => {
  try {
    const {
      notionApiKey,
      notionDatabaseId,
      githubToken,
      githubRepoOwner,
      githubRepoName,
      githubBranch,
      outputPath,
    } = req.body;

    // Validate required fields
    if (!notionApiKey || !notionDatabaseId || !githubToken || !githubRepoOwner || !githubRepoName || !githubBranch || !outputPath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required configuration parameters',
      });
    }

    const config: ConversionConfig = {
      notionDatabaseId,
      githubRepoOwner,
      githubRepoName,
      githubBranch,
      outputPath,
    };

    const converter = new NotionToGitHubConverter(notionApiKey, githubToken, config);

    // Validate configuration
    const validation = await converter.validateConfiguration();
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration',
        errors: validation.errors,
      });
    }

    // Perform conversion
    const result = await converter.convertAndPush();

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    });
  }
});

// Convert single page
app.post('/api/convert/page', async (req, res) => {
  try {
    const {
      notionApiKey,
      notionDatabaseId,
      githubToken,
      githubRepoOwner,
      githubRepoName,
      githubBranch,
      outputPath,
      pageId,
    } = req.body;

    // Validate required fields
    if (!notionApiKey || !notionDatabaseId || !githubToken || !githubRepoOwner || !githubRepoName || !githubBranch || !outputPath || !pageId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required configuration parameters',
      });
    }

    const config: ConversionConfig = {
      notionDatabaseId,
      githubRepoOwner,
      githubRepoName,
      githubBranch,
      outputPath,
    };

    const converter = new NotionToGitHubConverter(notionApiKey, githubToken, config);

    // Validate configuration
    const validation = await converter.validateConfiguration();
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid configuration',
        errors: validation.errors,
      });
    }

    // Perform single page conversion
    const result = await converter.convertSinglePage(pageId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    });
  }
});

// Validate configuration
app.post('/api/validate', async (req, res) => {
  try {
    const {
      notionApiKey,
      notionDatabaseId,
      githubToken,
      githubRepoOwner,
      githubRepoName,
      githubBranch,
      outputPath,
    } = req.body;

    const config: ConversionConfig = {
      notionDatabaseId,
      githubRepoOwner,
      githubRepoName,
      githubBranch,
      outputPath,
    };

    const converter = new NotionToGitHubConverter(notionApiKey, githubToken, config);
    const validation = await converter.validateConfiguration();

    res.json({
      success: validation.isValid,
      message: validation.isValid ? 'Configuration is valid' : 'Configuration has errors',
      errors: validation.errors,
    });
  } catch (error) {
    console.error('Validation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation failed',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    });
  }
});

// Webhook endpoint to receive Notion notifications (via Notion Automations or 3rd-party)
app.post('/api/webhooks/notion', async (req, res) => {
  try {
    const providedSecret = req.header('X-Webhook-Secret') || '';
    const expectedSecret = process.env.WEBHOOK_SECRET || '';

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { converter } = buildConverterFromEnv();

    // Try to extract a page id from common payload shapes
    // 1) { pageId: "..." }
    // 2) { event: { target: { id: "...", type: "page_id" } } }
    // 3) { events: [{ type: 'page.updated', data: { id: '...' } }] }
    let pageId: string | undefined;

    const body: any = req.body || {};

    if (typeof body.pageId === 'string') {
      pageId = body.pageId;
    } else if (body?.event?.target?.id && typeof body.event.target.id === 'string') {
      pageId = body.event.target.id;
    } else if (Array.isArray(body?.events) && body.events.length > 0) {
      const first = body.events[0];
      if (first?.data?.id && typeof first.data.id === 'string') {
        pageId = first.data.id;
      }
    }

    if (pageId) {
      const result = await converter.convertSinglePage(pageId);
      const statusCode = result.success ? 200 : 500;
      return res.status(statusCode).json(result);
    }

    // If no page id present, fall back to full database sync
    const fullResult = await converter.convertAndPush();
    const statusCode = fullResult.success ? 200 : 500;
    return res.status(statusCode).json(fullResult);
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ success: false, message: 'Webhook handling failed', errors: [error instanceof Error ? error.message : 'Unknown error'] });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
