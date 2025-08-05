import Anthropic from '@anthropic-ai/sdk';
import { 
  ClaudeRequest, 
  ClaudeResponse, 
  ClaudeMessage, 
  ClaudeAPIError,
  PageContent,
  UserGoal 
} from '@/types';
import logger from '@/core/utils/logger';
import config from '@/core/utils/config';
import validator from '@/core/utils/validator';

export interface SummarizationOptions {
  maxLength?: 'brief' | 'detailed' | 'comprehensive';
  format?: 'paragraph' | 'bullets' | 'structured';
  focus?: string[];
}

export interface GoalAnalysisOptions {
  includeSteps?: boolean;
  includeRecommendations?: boolean;
  maxSteps?: number;
}

class ClaudeClient {
  private client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number = 4000;
  private readonly temperature: number = 0.3;

  constructor() {
    const apiKey = config.get().claudeApiKey;
    if (!apiKey) {
      throw new ClaudeAPIError('Claude API key not configured');
    }

    this.client = new Anthropic({
      apiKey: apiKey
    });
    
    this.model = config.get().claudeModel;
    logger.info('Claude client initialized', { model: this.model });
  }

  public async summarizeContent(
    content: PageContent,
    options: SummarizationOptions = {}
  ): Promise<{
    summary: string;
    keyPoints: string[];
    entities: Array<{ name: string; type: string; confidence: number }>;
    sentiment: 'positive' | 'neutral' | 'negative';
    relevanceScore: number;
  }> {
    try {
      // Input validation
      if (!content) {
        throw new ClaudeAPIError('Content is required');
      }
      
      if (!content.text || typeof content.text !== 'string') {
        throw new ClaudeAPIError('Content text is required and must be a string');
      }
      
      if (content.text.trim().length === 0) {
        throw new ClaudeAPIError('Content text cannot be empty');
      }
      
      if (content.text.length > 100000) {
        throw new ClaudeAPIError('Content text is too long (max 100,000 characters)');
      }

      const prompt = this.buildSummarizationPrompt(content, options);
      const response = await this.makeRequest(prompt);
      
      if (!response || !response.content || !Array.isArray(response.content)) {
        throw new ClaudeAPIError('Invalid response format from Claude API');
      }
      
      const firstContent = response.content[0];
      const responseText = firstContent && 'text' in firstContent ? firstContent.text : '';
      
      if (!responseText) {
        throw new ClaudeAPIError('No content returned from Claude API');
      }
      
      const result = this.parseSummarizationResponse(responseText);
      
      logger.info('Content summarized successfully', {
        url: content.url,
        summaryLength: result.summary?.length || 0,
        keyPointsCount: result.keyPoints?.length || 0
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to summarize content', error);
      if (error instanceof ClaudeAPIError) {
        throw error;
      }
      throw new ClaudeAPIError(`Summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async analyzeGoal(
    goal: UserGoal,
    context?: {
      currentPage?: PageContent;
      recentPages?: PageContent[];
      userHistory?: string[];
    },
    options: GoalAnalysisOptions = {}
  ): Promise<{
    intent: {
      type: string;
      confidence: number;
      parameters: Record<string, any>;
    };
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    actionPlan: Array<{
      step: number;
      action: string;
      description: string;
      url?: string;
      selector?: string;
    }>;
    recommendations: string[];
  }> {
    try {
      // Input validation
      if (!goal) {
        throw new ClaudeAPIError('Goal is required');
      }
      
      if (!goal.text || typeof goal.text !== 'string') {
        throw new ClaudeAPIError('Goal text is required and must be a string');
      }
      
      if (goal.text.trim().length === 0) {
        throw new ClaudeAPIError('Goal text cannot be empty');
      }

      const prompt = this.buildGoalAnalysisPrompt(goal, context, options);
      const response = await this.makeRequest(prompt);
      
      if (!response || !response.content || !Array.isArray(response.content)) {
        throw new ClaudeAPIError('Invalid response format from Claude API');
      }
      
      const firstContent = response.content[0];
      const responseText = firstContent && 'text' in firstContent ? firstContent.text : '';
      
      if (!responseText) {
        throw new ClaudeAPIError('No content returned from Claude API');
      }
      
      const result = this.parseGoalAnalysisResponse(responseText);
      
      logger.info('Goal analyzed successfully', {
        goalId: goal.id,
        intent: result.intent?.type || 'unknown',
        stepsCount: result.actionPlan?.length || 0
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to analyze goal', error);
      if (error instanceof ClaudeAPIError) {
        throw error;
      }
      throw new ClaudeAPIError(`Goal analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async generateResponse(
    userMessage: string,
    context?: {
      currentPage?: PageContent;
      taskHistory?: string[];
      conversationHistory?: ClaudeMessage[];
    }
  ): Promise<string> {
    try {
      const messages: ClaudeMessage[] = [];
      
      // Add conversation history if provided
      if (context?.conversationHistory) {
        messages.push(...context.conversationHistory.slice(-10)); // Keep last 10 messages
      }
      
      // Add current message with context
      const contextualMessage = this.buildContextualMessage(userMessage, context);
      messages.push({
        role: 'user',
        content: contextualMessage
      });

      const request: ClaudeRequest = {
        model: this.model,
        max_tokens: this.maxTokens,
        messages,
        system: this.getSystemPrompt(),
        temperature: this.temperature
      };

      const response = await this.client.messages.create(request);
      
      const firstContent = response.content[0];
      const responseText = firstContent && 'text' in firstContent ? firstContent.text : '';
      
      // Validate response for safety
      if (!validator.validateClaudeResponse(responseText)) {
        throw new ClaudeAPIError('Response failed safety validation');
      }
      
      logger.debug('Generated response', { 
        inputLength: userMessage.length,
        outputLength: responseText.length
      });
      
      return responseText;
    } catch (error) {
      logger.error('Failed to generate response', error);
      throw new ClaudeAPIError(`Response generation failed: ${error.message}`);
    }
  }

  public async extractStructuredData(
    content: PageContent,
    schema: {
      fields: Array<{
        name: string;
        type: 'string' | 'number' | 'date' | 'array' | 'object';
        description: string;
        required?: boolean;
      }>;
    }
  ): Promise<Record<string, any>> {
    try {
      const prompt = this.buildDataExtractionPrompt(content, schema);
      const response = await this.makeRequest(prompt);
      
      const firstContent = response.content[0];
      const responseText = firstContent && 'text' in firstContent ? firstContent.text : '';
      const result = this.parseStructuredDataResponse(responseText);
      
      logger.info('Structured data extracted', {
        url: content.url,
        fieldsExtracted: Object.keys(result).length
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to extract structured data', error);
      throw new ClaudeAPIError(`Data extraction failed: ${error.message}`);
    }
  }

  private async makeRequest(messages: ClaudeMessage[]): Promise<ClaudeResponse> {
    const request: ClaudeRequest = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages,
      system: this.getSystemPrompt(),
      temperature: this.temperature,
      top_p: 0.95
    };

    try {
      const response = await this.client.messages.create(request);
      
      logger.debug('Claude API request completed', {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: response.model
      });
      
      return response as ClaudeResponse;
    } catch (error: any) {
      if (error.status === 429) {
        logger.warn('Claude API rate limit exceeded');
        throw new ClaudeAPIError('Rate limit exceeded. Please try again later.');
      } else if (error.status === 401) {
        logger.error('Claude API authentication failed');
        throw new ClaudeAPIError('Authentication failed. Please check your API key.');
      } else {
        logger.error('Claude API request failed', error);
        throw new ClaudeAPIError(`API request failed: ${error.message || 'Unknown error'}`);
      }
    }
  }

  private getSystemPrompt(): string {
    return `You are SmartBrowser, an intelligent browser automation assistant. Your capabilities include:

1. Summarizing web page content with key insights and actionable information
2. Analyzing user goals and creating step-by-step action plans
3. Extracting structured data from web content
4. Providing contextual assistance based on current browsing session

Guidelines:
- Be concise but comprehensive in your analysis
- Focus on actionable insights and practical next steps
- Maintain user privacy and security at all times
- Format responses in clear, structured JSON when requested
- Always validate URLs and user inputs for security
- Prioritize user safety and ethical guidelines

Current date: ${new Date().toISOString().split('T')[0]}`;
  }

  private buildSummarizationPrompt(
    content: PageContent,
    options: SummarizationOptions
  ): ClaudeMessage[] {
    const lengthInstruction = {
      brief: 'Keep the summary under 100 words',
      detailed: 'Provide a detailed summary of 200-300 words',
      comprehensive: 'Create a comprehensive summary with full context'
    }[options.maxLength || 'detailed'];

    const formatInstruction = {
      paragraph: 'Format as flowing paragraphs',
      bullets: 'Use bullet points for key information',
      structured: 'Use clear sections with headers'
    }[options.format || 'paragraph'];

    const focusInstruction = options.focus?.length 
      ? `Focus particularly on: ${options.focus.join(', ')}`
      : '';

    return [{
      role: 'user',
      content: `Please analyze and summarize the following web page content. ${lengthInstruction}. ${formatInstruction}. ${focusInstruction}

Page URL: ${content.url}
Page Title: ${content.title}
Content: ${content.text.substring(0, 15000)}

Please provide your response in the following JSON format:
{
  "summary": "Your summary here",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "entities": [{"name": "Entity Name", "type": "person|organization|location|product", "confidence": 0.9}],
  "sentiment": "positive|neutral|negative",
  "relevanceScore": 0.85
}`
    }];
  }

  private buildGoalAnalysisPrompt(
    goal: UserGoal,
    context?: any,
    options: GoalAnalysisOptions = {}
  ): ClaudeMessage[] {
    const contextInfo = context ? `
Current Page: ${context.currentPage?.title || 'N/A'} (${context.currentPage?.url || 'N/A'})
Recent Pages: ${context.recentPages?.map((p: any) => p.title).join(', ') || 'None'}
User History: ${context.userHistory?.join(', ') || 'None'}` : '';

    const stepInstruction = options.includeSteps 
      ? `Generate up to ${options.maxSteps || 5} specific action steps.`
      : 'Focus on intent analysis only.';

    return [{
      role: 'user',
      content: `Analyze the following user goal and provide detailed insights:

Goal: "${goal.text}"
Priority: ${goal.priority}
${contextInfo}

${stepInstruction}
${options.includeRecommendations ? 'Include relevant recommendations.' : ''}

Provide your response in this JSON format:
{
  "intent": {
    "type": "search|booking|shopping|social|summarize|navigate",
    "confidence": 0.9,
    "parameters": {"key": "value"}
  },
  "entities": [{"type": "location|date|product|person", "value": "entity value", "confidence": 0.8}],
  "actionPlan": [
    {"step": 1, "action": "navigate", "description": "Go to website", "url": "https://example.com"},
    {"step": 2, "action": "search", "description": "Search for item", "selector": "#search-input"}
  ],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`
    }];
  }

  private buildContextualMessage(
    userMessage: string,
    context?: any
  ): string {
    let contextualMessage = userMessage;
    
    if (context?.currentPage) {
      contextualMessage += `\n\nCurrent page context:
Title: ${context.currentPage.title}
URL: ${context.currentPage.url}
Content snippet: ${context.currentPage.text.substring(0, 500)}...`;
    }
    
    if (context?.taskHistory?.length) {
      contextualMessage += `\n\nRecent tasks: ${context.taskHistory.slice(-3).join(', ')}`;
    }
    
    return contextualMessage;
  }

  private buildDataExtractionPrompt(
    content: PageContent,
    schema: any
  ): ClaudeMessage[] {
    const fieldDescriptions = schema.fields.map((f: any) => 
      `- ${f.name} (${f.type}${f.required ? ', required' : ''}): ${f.description}`
    ).join('\n');

    return [{
      role: 'user',
      content: `Extract structured data from the following web page content according to the specified schema:

Page URL: ${content.url}
Page Title: ${content.title}
Content: ${content.text.substring(0, 10000)}

Schema fields:
${fieldDescriptions}

Return only valid JSON with the extracted data. If a field cannot be found or determined, use null for optional fields or provide a reasonable default for required fields.`
    }];
  }

  private parseSummarizationResponse(response: string): any {
    try {
      // Try to parse as JSON first
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback to text parsing
      return {
        summary: response.substring(0, 500),
        keyPoints: [],
        entities: [],
        sentiment: 'neutral' as const,
        relevanceScore: 0.5
      };
    } catch (error) {
      logger.warn('Failed to parse summarization response', error);
      return {
        summary: response.substring(0, 500),
        keyPoints: [],
        entities: [],
        sentiment: 'neutral' as const,
        relevanceScore: 0.5
      };
    }
  }

  private parseGoalAnalysisResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback
      return {
        intent: { type: 'search', confidence: 0.5, parameters: {} },
        entities: [],
        actionPlan: [],
        recommendations: []
      };
    } catch (error) {
      logger.warn('Failed to parse goal analysis response', error);
      return {
        intent: { type: 'search', confidence: 0.5, parameters: {} },
        entities: [],
        actionPlan: [],
        recommendations: []
      };
    }
  }

  private parseStructuredDataResponse(response: string): Record<string, any> {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch (error) {
      logger.warn('Failed to parse structured data response', error);
      return {};
    }
  }
}

export { ClaudeClient };
export const claudeClient = new ClaudeClient();
export default claudeClient;