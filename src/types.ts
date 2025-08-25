export interface NotionPage {
  id: string;
  title: string;
  content: string;
  properties: Record<string, any>;
  lastEditedTime: string;
  url: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  message: string;
}

export interface ConversionConfig {
  notionDatabaseId: string;
  githubRepoOwner: string;
  githubRepoName: string;
  githubBranch: string;
  outputPath: string;
}

export interface ConversionResult {
  success: boolean;
  message: string;
  filesProcessed?: number;
  errors?: string[];
}

export interface NotionBlock {
  type: string;
  content: any;
  children?: NotionBlock[];
}
