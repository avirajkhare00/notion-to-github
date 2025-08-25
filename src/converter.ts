import { NotionService } from './notionService';
import { GitHubService } from './githubService';
import { ConversionConfig, ConversionResult, GitHubFile } from './types';

export class NotionToGitHubConverter {
  private notionService: NotionService;
  private githubService: GitHubService;
  private config: ConversionConfig;

  constructor(
    notionApiKey: string,
    githubToken: string,
    config: ConversionConfig
  ) {
    this.notionService = new NotionService(notionApiKey);
    this.githubService = new GitHubService(githubToken, config);
    this.config = config;
  }

  async convertAndPush(): Promise<ConversionResult> {
    try {
      console.log('Starting Notion to GitHub MDX conversion...');

      // Validate GitHub repository
      const isValidRepo = await this.githubService.validateRepository();
      if (!isValidRepo) {
        return {
          success: false,
          message: 'Invalid GitHub repository configuration',
          errors: ['Repository not found or access denied'],
        };
      }

      // Fetch pages from Notion
      console.log('Fetching pages from Notion...');
      const pages = await this.notionService.getPagesFromDatabase(this.config.notionDatabaseId);

      if (pages.length === 0) {
        return {
          success: false,
          message: 'No pages found in the specified Notion database',
          errors: ['Database is empty or access denied'],
        };
      }

      console.log(`Found ${pages.length} pages in Notion`);

      // Convert pages to MDX and prepare for GitHub
      const files: GitHubFile[] = [];
      const errors: string[] = [];

      for (const page of pages) {
        try {
          const mdxContent = this.notionService.convertToMDX(page);
          const fileName = this.generateFileName(page.title);
          const filePath = `${this.config.outputPath}/${fileName}.mdx`;

          files.push({
            path: filePath,
            content: mdxContent,
            message: `Update ${page.title} from Notion`,
          });

          console.log(`Converted: ${page.title} -> ${filePath}`);
        } catch (error) {
          const errorMsg = `Failed to convert page "${page.title}": ${error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      if (files.length === 0) {
        return {
          success: false,
          message: 'No files were successfully converted',
          errors,
        };
      }

      // Push files to GitHub
      console.log('Pushing files to GitHub...');
      await this.githubService.pushFiles(files);

      return {
        success: true,
        message: `Successfully converted and pushed ${files.length} pages to GitHub`,
        filesProcessed: files.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      console.error('Conversion failed:', error);
      return {
        success: false,
        message: 'Conversion process failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  async convertSinglePage(pageId: string): Promise<ConversionResult> {
    try {
      // This would require additional Notion API calls to get a single page
      // For now, we'll use the existing database approach
      const pages = await this.notionService.getPagesFromDatabase(this.config.notionDatabaseId);
      const targetPage = pages.find(page => page.id === pageId);

      if (!targetPage) {
        return {
          success: false,
          message: 'Page not found',
          errors: [`Page with ID ${pageId} not found in database`],
        };
      }

      const mdxContent = this.notionService.convertToMDX(targetPage);
      const fileName = this.generateFileName(targetPage.title);
      const filePath = `${this.config.outputPath}/${fileName}.mdx`;

      await this.githubService.createOrUpdateFile(
        filePath,
        mdxContent,
        `Update ${targetPage.title} from Notion`
      );

      return {
        success: true,
        message: `Successfully converted and pushed "${targetPage.title}" to GitHub`,
        filesProcessed: 1,
      };
    } catch (error) {
      console.error('Single page conversion failed:', error);
      return {
        success: false,
        message: 'Single page conversion failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  private generateFileName(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
  }

  async validateConfiguration(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate Notion configuration
    if (!this.config.notionDatabaseId) {
      errors.push('Notion database ID is required');
    }

    // Validate GitHub configuration
    if (!this.config.githubRepoOwner) {
      errors.push('GitHub repository owner is required');
    }
    if (!this.config.githubRepoName) {
      errors.push('GitHub repository name is required');
    }
    if (!this.config.githubBranch) {
      errors.push('GitHub branch is required');
    }

    // Validate output path
    if (!this.config.outputPath) {
      errors.push('Output path is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
