import { Octokit } from '@octokit/rest';
import { GitHubFile, ConversionConfig } from './types';

export class GitHubService {
  private octokit: Octokit;
  private config: ConversionConfig;

  constructor(token: string, config: ConversionConfig) {
    this.octokit = new Octokit({
      auth: token,
    });
    this.config = config;
  }

  async pushFiles(files: GitHubFile[]): Promise<void> {
    try {
      // Get the current commit SHA for the branch
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.config.githubRepoOwner,
        repo: this.config.githubRepoName,
        ref: `heads/${this.config.githubBranch}`,
      });

      const baseTreeSha = ref.object.sha;

      // Create tree with all files
      const tree = await this.createTree(files, baseTreeSha);

      // Create commit
      const commit = await this.octokit.git.createCommit({
        owner: this.config.githubRepoOwner,
        repo: this.config.githubRepoName,
        message: `Update MDX files from Notion - ${new Date().toISOString()}`,
        tree: tree.sha,
        parents: [baseTreeSha],
      });

      // Update branch reference
      await this.octokit.git.updateRef({
        owner: this.config.githubRepoOwner,
        repo: this.config.githubRepoName,
        ref: `heads/${this.config.githubBranch}`,
        sha: commit.data.sha,
      });

      console.log(`Successfully pushed ${files.length} files to GitHub`);
    } catch (error) {
      console.error('Error pushing files to GitHub:', error);
      throw new Error('Failed to push files to GitHub');
    }
  }

  private async createTree(files: GitHubFile[], baseTreeSha: string): Promise<any> {
    const tree = files.map(file => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: file.content,
    }));

    const { data } = await this.octokit.git.createTree({
      owner: this.config.githubRepoOwner,
      repo: this.config.githubRepoName,
      tree,
      base_tree: baseTreeSha,
    });

    return data;
  }

  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await this.octokit.repos.getContent({
        owner: this.config.githubRepoOwner,
        repo: this.config.githubRepoName,
        path: filePath,
        ref: this.config.githubBranch,
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  async getFileContent(filePath: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.config.githubRepoOwner,
        repo: this.config.githubRepoName,
        path: filePath,
        ref: this.config.githubBranch,
      });

      if ('content' in data && 'encoding' in data) {
        const enc = String(data.encoding) as BufferEncoding;
        return Buffer.from(String(data.content), enc).toString();
      }
      return null;
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createOrUpdateFile(filePath: string, content: string, message: string): Promise<void> {
    try {
      const existingFile = await this.getFileContent(filePath);

      if (existingFile) {
        // Update existing file
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.config.githubRepoOwner,
          repo: this.config.githubRepoName,
          path: filePath,
          message,
          content: Buffer.from(content).toString('base64'),
          sha: await this.getFileSha(filePath),
          branch: this.config.githubBranch,
        });
      } else {
        // Create new file
        await this.octokit.repos.createOrUpdateFileContents({
          owner: this.config.githubRepoOwner,
          repo: this.config.githubRepoName,
          path: filePath,
          message,
          content: Buffer.from(content).toString('base64'),
          branch: this.config.githubBranch,
        });
      }
    } catch (error) {
      console.error(`Error creating/updating file ${filePath}:`, error);
      throw new Error(`Failed to create/update file: ${filePath}`);
    }
  }

  private async getFileSha(filePath: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.config.githubRepoOwner,
      repo: this.config.githubRepoName,
      path: filePath,
      ref: this.config.githubBranch,
    });

    if ('sha' in data) {
      return data.sha;
    }
    throw new Error('Could not get file SHA');
  }

  async validateRepository(): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner: this.config.githubRepoOwner,
        repo: this.config.githubRepoName,
      });
      return true;
    } catch (error) {
      console.error('Repository validation failed:', error);
      return false;
    }
  }
}
