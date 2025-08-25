import { Client } from '@notionhq/client';
// import TurndownService from 'turndown';
import matter from 'gray-matter';
import { NotionPage } from './types';

export class NotionService {
  private client: Client;
  // Placeholder for future HTML->MD conversion needs

  constructor(apiKey: string) {
    this.client = new Client({ auth: apiKey });
    // If needed later: initialize turndown for HTML->MD conversion
  }

  async getPagesFromDatabase(databaseId: string): Promise<NotionPage[]> {
    try {
      const response = await this.client.databases.query({
        database_id: databaseId,
        sorts: [
          {
            property: 'Last edited time',
            direction: 'descending',
          },
        ],
      });

      const pages: NotionPage[] = [];

      for (const page of response.results) {
        if ('properties' in page && 'id' in page) {
          const pageId = (page as any).id as string;
          const lastEditedTime = (page as any).last_edited_time as string | undefined;
          const url = (page as any).url as string | undefined;
          const pageContent = await this.getPageContent(pageId);
          const title = this.extractTitle((page as any).properties);

          pages.push({
            id: pageId,
            title,
            content: pageContent,
            properties: (page as any).properties,
            lastEditedTime: lastEditedTime || new Date().toISOString(),
            url: url || '',
          });
        }
      }

      return pages;
    } catch (error) {
      console.error('Error fetching pages from Notion:', error);
      throw new Error('Failed to fetch pages from Notion');
    }
  }

  async getPageContent(pageId: string): Promise<string> {
    try {
      const blocks = await this.client.blocks.children.list({
        block_id: pageId,
      });

      return this.convertBlocksToMarkdown(blocks.results);
    } catch (error) {
      console.error('Error fetching page content:', error);
      return '';
    }
  }

  async getPageTitle(pageId: string): Promise<string> {
    try {
      const page = await this.client.pages.retrieve({
        page_id: pageId,
      });

      if ('properties' in page) {
        return this.extractTitle((page as any).properties);
      }
      return 'Untitled';
    } catch (error) {
      console.error('Error fetching page title:', error);
      return 'Untitled';
    }
  }

  private convertBlocksToMarkdown(blocks: any[]): string {
    let markdown = '';

    for (const block of blocks) {
      markdown += this.convertBlockToMarkdown(block);
    }

    return markdown;
  }

  private convertBlockToMarkdown(block: any): string {
    const type = block.type;
    let content = '';

    switch (type) {
      case 'paragraph':
        content = this.renderParagraph(block.paragraph);
        break;
      case 'heading_1':
        content = this.renderHeading(block.heading_1, 1);
        break;
      case 'heading_2':
        content = this.renderHeading(block.heading_2, 2);
        break;
      case 'heading_3':
        content = this.renderHeading(block.heading_3, 3);
        break;
      case 'bulleted_list_item':
        content = this.renderBulletedListItem(block.bulleted_list_item);
        break;
      case 'numbered_list_item':
        content = this.renderNumberedListItem(block.numbered_list_item);
        break;
      case 'code':
        content = this.renderCode(block.code);
        break;
      case 'quote':
        content = this.renderQuote(block.quote);
        break;
      case 'image':
        content = this.renderImage(block.image);
        break;
      case 'divider':
        content = '\n---\n\n';
        break;
      default:
        content = this.renderRichText(block[type]?.rich_text || []);
    }

    return content + '\n\n';
  }

  private renderRichText(richText: any[]): string {
    return richText.map(text => {
      let content = text.plain_text;

      if (text.annotations.bold) content = `**${content}**`;
      if (text.annotations.italic) content = `*${content}*`;
      if (text.annotations.strikethrough) content = `~~${content}~~`;
      if (text.annotations.code) content = `\`${content}\``;
      if (text.href) content = `[${content}](${text.href})`;

      return content;
    }).join('');
  }

  private renderParagraph(paragraph: any): string {
    return this.renderRichText(paragraph.rich_text);
  }

  private renderHeading(heading: any, level: number): string {
    const prefix = '#'.repeat(level);
    return `${prefix} ${this.renderRichText(heading.rich_text)}`;
  }

  private renderBulletedListItem(item: any): string {
    return `- ${this.renderRichText(item.rich_text)}`;
  }

  private renderNumberedListItem(item: any): string {
    return `1. ${this.renderRichText(item.rich_text)}`;
  }

  private renderCode(code: any): string {
    const language = code.language || '';
    const content = this.renderRichText(code.rich_text);
    return `\`\`\`${language}\n${content}\n\`\`\``;
  }

  private renderQuote(quote: any): string {
    const content = this.renderRichText(quote.rich_text);
    return `> ${content}`;
  }

  private renderImage(image: any): string {
    const caption = image.caption ? this.renderRichText(image.caption) : '';
    const url = image.type === 'external' ? image.external.url : image.file.url;
    return `![${caption}](${url})`;
  }

  private extractTitle(properties: any): string {
    // Try to find the title property
    for (const [, value] of Object.entries(properties)) {
      const v: any = value as any;
      if (v?.type === 'title' && Array.isArray(v.title) && v.title.length > 0) {
        return v.title[0].plain_text as string;
      }
    }
    return 'Untitled';
  }

  convertToMDX(page: NotionPage, frontMatter?: Record<string, any>): string {
    // Format date as YYYY-MM-DD for publishedAt
    const publishedDate = new Date(page.lastEditedTime).toISOString().split('T')[0];

    // Generate summary from first paragraph or heading
    const firstParagraph = page.content.split('\n\n')[0] || '';
    const summary = firstParagraph.length > 150
      ? firstParagraph.substring(0, 150) + '...'
      : firstParagraph || 'No summary available';

    const defaultFrontMatter = {
      title: page.title,
      publishedAt: publishedDate,
      summary: summary,
      ...frontMatter,
    };

    const frontMatterString = matter.stringify('', defaultFrontMatter);
    const content = page.content;

    return `${frontMatterString}\n\n${content}`;
  }
}
