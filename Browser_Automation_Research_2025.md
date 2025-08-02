# Browser Automation Assistant Research Report - 2025

## Table of Contents
1. [Browser Automation Libraries](#browser-automation-libraries)
2. [Voice-to-Text APIs](#voice-to-text-apis)
3. [Content Extraction and Summarization](#content-extraction-and-summarization)
4. [OAuth2 and API Integration](#oauth2-and-api-integration)
5. [Browser Extension Development](#browser-extension-development)
6. [Architecture Patterns](#architecture-patterns)
7. [Implementation Recommendations](#implementation-recommendations)

---

## 1. Browser Automation Libraries

### Puppeteer vs Playwright Comparison (2025)

#### Feature Comparison Matrix

| Feature | Puppeteer | Playwright |
|---------|-----------|------------|
| Browser Support | Chrome/Chromium (experimental Firefox) | Chrome, Firefox, WebKit |
| Language Support | JavaScript only | JavaScript, Python, Java, C# |
| Performance | Slightly faster for Chrome-only tasks | Superior overall performance (4.513s vs 4.784s avg) |
| Auto-waiting | Basic auto-wait with timing issues | Robust auto-wait mechanisms |
| Network Interception | Basic support | Advanced capabilities |
| Performance Testing | Basic assessments | Detailed performance testing with throttling |
| Community Maturity | 87,000+ stars, mature ecosystem | 64,000+ stars, growing rapidly |

#### Puppeteer Code Example
```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({
  headless: false,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto('https://example.com');

// Wait for element and interact
await page.waitForSelector('.dynamic-content');
await page.click('#submit-button');

await browser.close();
```

#### Playwright Code Example
```javascript
const { chromium, firefox, webkit } = require('playwright');

// Multi-browser support
for (const browserType of [chromium, firefox, webkit]) {
  const browser = await browserType.launch();
  const page = await browser.newPage();
  
  // Auto-waiting is built-in
  await page.goto('https://example.com');
  await page.locator('.dynamic-content').click();
  
  await browser.close();
}
```

### Best Practices for Browser Automation

#### 1. Dynamic Content Handling

```javascript
// Explicit Wait Pattern
await page.waitForFunction(() => {
  return document.querySelector('.dynamic-element').textContent.length > 0;
});

// Multiple Wait Conditions
await page.waitForSelector('.loading-spinner', { state: 'hidden' });
await page.waitForSelector('.content', { state: 'visible' });
```

#### 2. Session Management

```javascript
class BrowserSessionManager {
  constructor() {
    this.browser = null;
    this.pages = new Map();
  }

  async initSession() {
    this.browser = await playwright.chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
  }

  async createPage(sessionId) {
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    this.pages.set(sessionId, { page, context });
    return page;
  }

  async cleanupSession(sessionId) {
    const session = this.pages.get(sessionId);
    if (session) {
      await session.context.close();
      this.pages.delete(sessionId);
    }
  }
}
```

#### 3. Error Handling and Retries

```javascript
class RobustAutomation {
  async performActionWithRetry(action, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await action();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        await this.handleError(error, i);
        await this.delay(Math.pow(2, i) * 1000); // Exponential backoff
      }
    }
  }

  async handleError(error, attemptNumber) {
    if (error.message.includes('Element not found')) {
      await this.page.reload();
    } else if (error.message.includes('Navigation timeout')) {
      await this.page.setDefaultTimeout(60000);
    }
  }
}
```

### Security Considerations

#### 1. Secure Token Storage
```javascript
// Environment-based configuration
const config = {
  apiKeys: {
    gmail: process.env.GMAIL_API_KEY,
    calendar: process.env.CALENDAR_API_KEY
  },
  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD
  }
};

// Never store in code
const secureStorage = new Map();
secureStorage.set('session_token', await generateSecureToken());
```

#### 2. Process Isolation
```javascript
const browserPool = {
  maxConcurrent: 10,
  processes: new Map(),
  
  async createIsolatedBrowser() {
    const browser = await playwright.chromium.launch({
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions'
      ]
    });
    
    // Implement cleanup timeout
    setTimeout(async () => {
      await browser.close();
    }, 300000); // 5 minutes max session
    
    return browser;
  }
};
```

---

## 2. Voice-to-Text APIs

### Whisper API vs Deepgram Comparison (2025)

#### Performance and Pricing Matrix

| Metric | Whisper API | Deepgram |
|--------|-------------|----------|
| Speed | Consistent performance | Up to 40x faster inference |
| Latency | Standard | <300ms real-time |
| Accuracy | 90%+ in ideal conditions | 30% lower WER claimed |
| Pricing | $0.0060/minute | $0.0043/minute (pre-recorded) |
| Language Support | Excellent multilingual | 36 languages (Nova-2) |
| Real-time | Limited | Excellent streaming support |

#### Whisper API Integration
```python
import openai
import io

class WhisperTranscriber:
    def __init__(self, api_key):
        openai.api_key = api_key
    
    async def transcribe_audio(self, audio_file_path):
        try:
            with open(audio_file_path, 'rb') as audio_file:
                transcript = await openai.Audio.atranscribe(
                    model="whisper-1",
                    file=audio_file,
                    response_format="json"
                )
            return transcript['text']
        except Exception as e:
            return f"Transcription error: {str(e)}"
    
    async def transcribe_stream(self, audio_stream):
        # For streaming, collect chunks and process
        audio_buffer = io.BytesIO()
        for chunk in audio_stream:
            audio_buffer.write(chunk)
        
        audio_buffer.seek(0)
        return await self.transcribe_audio(audio_buffer)
```

#### Deepgram Integration
```python
import asyncio
from deepgram import DeepgramClient, PrerecordedOptions, LiveOptions

class DeepgramTranscriber:
    def __init__(self, api_key):
        self.client = DeepgramClient(api_key)
    
    async def transcribe_prerecorded(self, audio_url):
        options = PrerecordedOptions(
            model="nova-2",
            smart_format=True,
            utterances=True,
            punctuate=True,
            diarize=True
        )
        
        response = await self.client.listen.asyncprerecorded.v("1").transcribe_url(
            {"url": audio_url}, options
        )
        
        return response.results.channels[0].alternatives[0].transcript
    
    async def setup_realtime_transcription(self, callback):
        options = LiveOptions(
            model="nova-2",
            punctuate=True,
            language="en-US",
            encoding="linear16",
            channels=1,
            sample_rate=16000
        )
        
        connection = self.client.listen.asynclive.v("1")
        
        async def on_message(self, result, **kwargs):
            sentence = result.channel.alternatives[0].transcript
            if sentence:
                await callback(sentence)
        
        connection.on(LiveTranscriptionEvents.Transcript, on_message)
        await connection.start(options)
        return connection
```

#### Integration Pattern
```javascript
class VoiceCommandHandler {
  constructor() {
    this.transcriber = new DeepgramTranscriber(process.env.DEEPGRAM_API_KEY);
    this.isListening = false;
  }

  async startVoiceCommand() {
    if (this.isListening) return;
    
    this.isListening = true;
    const audioStream = await this.captureAudio();
    
    const connection = await this.transcriber.setup_realtime_transcription(
      async (transcript) => {
        await this.processVoiceCommand(transcript);
      }
    );
    
    return connection;
  }

  async processVoiceCommand(command) {
    const intent = await this.parseIntent(command);
    
    switch (intent.action) {
      case 'navigate':
        await this.browserAutomation.navigateTo(intent.url);
        break;
      case 'summarize':
        await this.contentExtractor.summarizePage();
        break;
      case 'email':
        await this.gmailAPI.sendEmail(intent.recipient, intent.content);
        break;
    }
  }
}
```

---

## 3. Content Extraction and Summarization

### YouTube Transcript Extraction

#### 1. Using youtube-transcript-api (Python)
```python
from youtube_transcript_api import YouTubeTranscriptApi
import re

class YouTubeTranscriptExtractor:
    def __init__(self):
        self.api = YouTubeTranscriptApi
    
    def extract_video_id(self, url):
        """Extract video ID from YouTube URL"""
        pattern = r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)'
        match = re.search(pattern, url)
        return match.group(1) if match else None
    
    async def get_transcript(self, video_url, language='en'):
        try:
            video_id = self.extract_video_id(video_url)
            if not video_id:
                raise ValueError("Invalid YouTube URL")
            
            # Get transcript with fallback to auto-generated
            transcript_list = self.api.list_transcripts(video_id)
            
            try:
                transcript = transcript_list.find_transcript([language])
            except:
                # Fallback to auto-generated
                transcript = transcript_list.find_generated_transcript([language])
            
            # Format transcript
            formatted_transcript = []
            for entry in transcript.fetch():
                formatted_transcript.append({
                    'text': entry['text'],
                    'start': entry['start'],
                    'duration': entry['duration']
                })
            
            return formatted_transcript
            
        except Exception as e:
            return f"Transcript extraction error: {str(e)}"
    
    def format_for_summarization(self, transcript_data):
        """Format transcript for LLM summarization"""
        full_text = ' '.join([entry['text'] for entry in transcript_data])
        
        # Add timestamps for key sections
        timestamped_sections = []
        current_section = ""
        current_time = 0
        
        for entry in transcript_data:
            if entry['start'] - current_time > 30:  # New section every 30 seconds
                if current_section:
                    timestamped_sections.append({
                        'timestamp': current_time,
                        'text': current_section
                    })
                current_section = entry['text']
                current_time = entry['start']
            else:
                current_section += ' ' + entry['text']
        
        return {
            'full_text': full_text,
            'sections': timestamped_sections
        }
```

#### 2. Using yt-dlp for Enhanced Extraction
```python
import yt_dlp
import subprocess

class YTDLPExtractor:
    def __init__(self):
        self.ydl_opts = {
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitlesformat': 'vtt',
            'skip_download': True,
            'outtmpl': '/tmp/%(title)s.%(ext)s'
        }
    
    async def extract_with_metadata(self, video_url):
        try:
            with yt_dlp.YoutubeDL(self.ydl_opts) as ydl:
                # Extract info
                info = ydl.extract_info(video_url, download=False)
                
                # Download subtitles
                ydl.download([video_url])
                
                return {
                    'title': info.get('title', ''),
                    'description': info.get('description', ''),
                    'duration': info.get('duration', 0),
                    'view_count': info.get('view_count', 0),
                    'uploader': info.get('uploader', ''),
                    'upload_date': info.get('upload_date', ''),
                    'subtitle_files': self._find_subtitle_files(info.get('id'))
                }
        except Exception as e:
            return f"Extraction error: {str(e)}"
    
    def _find_subtitle_files(self, video_id):
        # Find generated subtitle files
        import glob
        return glob.glob(f'/tmp/*{video_id}*.vtt')
```

### Article Text Extraction

#### 1. Readability.js Implementation
```javascript
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

class ArticleExtractor {
  async extractCleanContent(url) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      
      const dom = new JSDOM(html, { url: url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      
      if (!article) {
        throw new Error('Failed to extract readable content');
      }
      
      return {
        title: article.title,
        content: article.textContent,
        html: article.content,
        excerpt: article.excerpt,
        byline: article.byline,
        length: article.length,
        readingTime: Math.ceil(article.length / 250) // ~250 words per minute
      };
      
    } catch (error) {
      return await this.fallbackExtraction(url);
    }
  }
  
  async fallbackExtraction(url) {
    // Custom selectors for common news sites
    const siteSelectors = {
      'medium.com': 'article',
      'substack.com': '.post-content',
      'wordpress.com': '.entry-content',
      'blogger.com': '.post-body'
    };
    
    const domain = new URL(url).hostname;
    const selector = siteSelectors[domain] || 'article, .content, main, .post';
    
    const page = await browser.newPage();
    await page.goto(url);
    
    const content = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      return element ? element.innerText : null;
    }, selector);
    
    await page.close();
    return { content, title: await page.title() };
  }
}
```

#### 2. Multi-Language Content Extraction
```python
import requests
from readability import Document
from langdetect import detect

class MultilingualExtractor:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    async def extract_article(self, url):
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            
            doc = Document(response.content)
            
            clean_content = doc.content()
            text_content = doc.summary()
            title = doc.title()
            
            # Detect language
            language = detect(text_content[:1000])  # Use first 1000 chars
            
            return {
                'title': title,
                'content': clean_content,
                'text': text_content,
                'language': language,
                'url': url,
                'word_count': len(text_content.split())
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    def preprocess_for_llm(self, extracted_content):
        """Prepare content for LLM summarization"""
        text = extracted_content['text']
        
        # Split into chunks for long articles
        max_chunk_size = 4000  # tokens
        chunks = []
        
        sentences = text.split('. ')
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk + sentence) < max_chunk_size:
                current_chunk += sentence + '. '
            else:
                chunks.append(current_chunk.strip())
                current_chunk = sentence + '. '
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return {
            'title': extracted_content['title'],
            'chunks': chunks,
            'metadata': {
                'language': extracted_content.get('language'),
                'word_count': extracted_content.get('word_count'),
                'url': extracted_content.get('url')
            }
        }
```

### DOM Parsing Strategies

#### 1. Adaptive Content Detection
```javascript
class AdaptiveDOMParser {
  constructor() {
    this.contentSelectors = [
      'article',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '#content',
      'main'
    ];
    
    this.excludeSelectors = [
      'nav',
      'header',
      'footer',
      '.advertisement',
      '.sidebar',
      '.comments',
      '.related-posts'
    ];
  }
  
  async parseContent(page) {
    const content = await page.evaluate((contentSels, excludeSels) => {
      // Remove unwanted elements
      excludeSels.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
      
      // Find main content
      for (const selector of contentSels) {
        const element = document.querySelector(selector);
        if (element && element.textContent.length > 500) {
          return {
            html: element.innerHTML,
            text: element.textContent,
            selector: selector
          };
        }
      }
      
      // Fallback: find largest text block
      const allElements = [...document.querySelectorAll('div, section, article')];
      const largest = allElements.reduce((prev, current) => {
        return current.textContent.length > prev.textContent.length ? current : prev;
      });
      
      return {
        html: largest.innerHTML,
        text: largest.textContent,
        selector: 'fallback'
      };
    }, this.contentSelectors, this.excludeSelectors);
    
    return content;
  }
}
```

---

## 4. OAuth2 and API Integration

### Gmail API Best Practices (2025)

#### 1. OAuth2 Implementation
```python
import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle

class GmailOAuthManager:
    SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
    
    def __init__(self, credentials_file='credentials.json', token_file='token.pickle'):
        self.credentials_file = credentials_file
        self.token_file = token_file
        self.creds = None
    
    def authenticate(self):
        """Handle OAuth2 authentication with proper error handling"""
        # Load existing token
        if os.path.exists(self.token_file):
            with open(self.token_file, 'rb') as token:
                self.creds = pickle.load(token)
        
        # Refresh or create new credentials
        if not self.creds or not self.creds.valid:
            if self.creds and self.creds.expired and self.creds.refresh_token:
                try:
                    self.creds.refresh(Request())
                except Exception as e:
                    print(f"Token refresh failed: {e}")
                    self.creds = None
            
            if not self.creds:
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, self.SCOPES)
                self.creds = flow.run_local_server(port=0)
            
            # Save credentials for next run
            with open(self.token_file, 'wb') as token:
                pickle.dump(self.creds, token)
        
        return self.creds
    
    def revoke_token(self):
        """Revoke token for security"""
        if self.creds:
            self.creds.revoke(Request())
            if os.path.exists(self.token_file):
                os.remove(self.token_file)
```

#### 2. Gmail API Integration
```python
from googleapiclient.discovery import build
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class GmailAPIClient:
    def __init__(self, oauth_manager):
        self.oauth_manager = oauth_manager
        self.service = None
    
    def _get_service(self):
        if not self.service:
            creds = self.oauth_manager.authenticate()
            self.service = build('gmail', 'v1', credentials=creds)
        return self.service
    
    async def send_email(self, to, subject, body, html_body=None):
        """Send email with proper error handling"""
        try:
            service = self._get_service()
            
            message = MIMEMultipart('alternative') if html_body else MIMEText(body)
            message['to'] = to
            message['subject'] = subject
            
            if html_body:
                text_part = MIMEText(body, 'plain')
                html_part = MIMEText(html_body, 'html')
                message.attach(text_part)
                message.attach(html_part)
            
            raw_message = base64.urlsafe_b64encode(
                message.as_bytes()).decode('utf-8')
            
            send_message = service.users().messages().send(
                userId="me", 
                body={'raw': raw_message}
            ).execute()
            
            return send_message
            
        except Exception as e:
            print(f"Email send error: {e}")
            return None
    
    async def search_emails(self, query, max_results=10):
        """Search emails with pagination"""
        try:
            service = self._get_service()
            
            results = service.users().messages().list(
                userId='me', 
                q=query, 
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            
            email_data = []
            for message in messages:
                msg = service.users().messages().get(
                    userId='me', 
                    id=message['id']
                ).execute()
                
                email_data.append(self._parse_message(msg))
            
            return email_data
            
        except Exception as e:
            print(f"Email search error: {e}")
            return []
    
    def _parse_message(self, message):
        """Parse Gmail message format"""
        headers = message['payload'].get('headers', [])
        
        subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '')
        sender = next((h['value'] for h in headers if h['name'] == 'From'), '')
        date = next((h['value'] for h in headers if h['name'] == 'Date'), '')
        
        # Extract body
        body = self._extract_body(message['payload'])
        
        return {
            'id': message['id'],
            'subject': subject,
            'sender': sender,
            'date': date,
            'body': body,
            'thread_id': message['threadId']
        }
    
    def _extract_body(self, payload):
        """Extract email body from various formats"""
        body = ""
        
        if 'parts' in payload:
            for part in payload['parts']:
                if part['mimeType'] == 'text/plain':
                    data = part['body']['data']
                    body = base64.urlsafe_b64decode(data).decode('utf-8')
                    break
        elif payload['mimeType'] == 'text/plain':
            data = payload['body']['data']
            body = base64.urlsafe_b64decode(data).decode('utf-8')
        
        return body
```

### Google Calendar API Integration

#### 1. Calendar Event Management
```python
from googleapiclient.discovery import build
from datetime import datetime, timedelta
import pytz

class GoogleCalendarClient:
    def __init__(self, oauth_manager):
        self.oauth_manager = oauth_manager
        self.service = None
    
    def _get_service(self):
        if not self.service:
            creds = self.oauth_manager.authenticate()
            self.service = build('calendar', 'v3', credentials=creds)
        return self.service
    
    async def create_event(self, title, start_time, end_time, description=None, attendees=None):
        """Create calendar event with proper timezone handling"""
        try:
            service = self._get_service()
            
            # Ensure timezone awareness
            if start_time.tzinfo is None:
                start_time = pytz.UTC.localize(start_time)
            if end_time.tzinfo is None:
                end_time = pytz.UTC.localize(end_time)
            
            event = {
                'summary': title,
                'description': description or '',
                'start': {
                    'dateTime': start_time.isoformat(),
                    'timeZone': str(start_time.tzinfo),
                },
                'end': {
                    'dateTime': end_time.isoformat(),
                    'timeZone': str(end_time.tzinfo),
                },
            }
            
            if attendees:
                event['attendees'] = [{'email': email} for email in attendees]
            
            created_event = service.events().insert(
                calendarId='primary', 
                body=event
            ).execute()
            
            return created_event
            
        except Exception as e:
            print(f"Calendar event creation error: {e}")
            return None
    
    async def get_upcoming_events(self, max_results=10, time_min=None):
        """Get upcoming events with filtering"""
        try:
            service = self._get_service()
            
            if not time_min:
                time_min = datetime.utcnow().isoformat() + 'Z'
            
            events_result = service.events().list(
                calendarId='primary',
                timeMin=time_min,
                maxResults=max_results,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            
            formatted_events = []
            for event in events:
                start = event['start'].get('dateTime', event['start'].get('date'))
                formatted_events.append({
                    'id': event['id'],
                    'title': event.get('summary', 'No Title'),
                    'start': start,
                    'description': event.get('description', ''),
                    'attendees': event.get('attendees', [])
                })
            
            return formatted_events
            
        except Exception as e:
            print(f"Calendar events retrieval error: {e}")
            return []
    
    async def update_event(self, event_id, updates):
        """Update existing calendar event"""
        try:
            service = self._get_service()
            
            # Get existing event
            event = service.events().get(
                calendarId='primary', 
                eventId=event_id
            ).execute()
            
            # Apply updates
            for key, value in updates.items():
                event[key] = value
            
            updated_event = service.events().update(
                calendarId='primary',
                eventId=event_id,
                body=event
            ).execute()
            
            return updated_event
            
        except Exception as e:
            print(f"Calendar event update error: {e}")
            return None
```

### LinkedIn API Workarounds (2025)

#### 1. Rate Limit Management
```python
import time
import random
from datetime import datetime, timedelta

class LinkedInRateLimiter:
    def __init__(self):
        self.request_history = []
        self.daily_limit = 100  # Connection requests per day
        self.hourly_limit = 20  # Profile views per hour
        
    def can_make_request(self, request_type='connection'):
        """Check if request can be made within limits"""
        now = datetime.now()
        
        if request_type == 'connection':
            # Check daily limit
            today_requests = [r for r in self.request_history 
                            if r['type'] == 'connection' 
                            and r['timestamp'].date() == now.date()]
            return len(today_requests) < self.daily_limit
        
        elif request_type == 'profile_view':
            # Check hourly limit
            hour_ago = now - timedelta(hours=1)
            recent_views = [r for r in self.request_history 
                          if r['type'] == 'profile_view' 
                          and r['timestamp'] > hour_ago]
            return len(recent_views) < self.hourly_limit
        
        return False
    
    def add_request(self, request_type):
        """Log a request"""
        self.request_history.append({
            'type': request_type,
            'timestamp': datetime.now()
        })
        
        # Clean old requests
        week_ago = datetime.now() - timedelta(days=7)
        self.request_history = [r for r in self.request_history 
                              if r['timestamp'] > week_ago]
    
    async def wait_with_jitter(self, base_delay=5):
        """Wait with random jitter to appear human-like"""
        jitter = random.uniform(0.5, 2.0)
        delay = base_delay + jitter
        await asyncio.sleep(delay)
```

#### 2. Alternative Approaches
```python
class LinkedInAlternativeAutomation:
    def __init__(self, browser_automation):
        self.browser = browser_automation
        self.rate_limiter = LinkedInRateLimiter()
    
    async def send_inmail_instead_of_connection(self, profile_url, message):
        """Use InMail to bypass connection limits"""
        if not self.rate_limiter.can_make_request('inmail'):
            return False
        
        try:
            page = await self.browser.new_page()
            await page.goto(profile_url)
            
            # Look for InMail button
            inmail_button = await page.query_selector('[data-control-name="inmail"]')
            if inmail_button:
                await inmail_button.click()
                
                # Fill message
                message_field = await page.wait_for_selector('textarea')
                await message_field.fill(message)
                
                # Send
                send_button = await page.query_selector('[data-control-name="send"]')
                await send_button.click()
                
                self.rate_limiter.add_request('inmail')
                await self.rate_limiter.wait_with_jitter()
                
                return True
        
        except Exception as e:
            print(f"InMail error: {e}")
            return False
        
        finally:
            await page.close()
    
    async def engage_via_groups(self, group_url, member_profiles):
        """Engage with members via LinkedIn groups"""
        try:
            page = await self.browser.new_page()
            await page.goto(group_url)
            
            for profile in member_profiles:
                if not self.rate_limiter.can_make_request('group_message'):
                    break
                
                # Navigate to member
                await page.goto(profile['url'])
                
                # Send message via group context
                message_button = await page.query_selector('[data-control-name="message"]')
                if message_button:
                    await message_button.click()
                    
                    # Compose message
                    await self._compose_personalized_message(page, profile)
                    
                    self.rate_limiter.add_request('group_message')
                    await self.rate_limiter.wait_with_jitter(10)
        
        except Exception as e:
            print(f"Group engagement error: {e}")
        
        finally:
            await page.close()
```

---

## 5. Browser Extension Development

### WebExtension API Implementation (2025)

#### 1. Manifest V3 Structure
```json
{
  "manifest_version": 3,
  "name": "Smart Browser Assistant",
  "version": "1.0.0",
  "description": "AI-powered browser automation assistant",
  
  "permissions": [
    "activeTab",
    "storage",
    "tabs",
    "scripting",
    "webRequest"
  ],
  
  "host_permissions": [
    "https://*/*"
  ],
  
  "background": {
    "service_worker": "background.js"
  },
  
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ],
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

#### 2. Service Worker Background Script
```javascript
// background.js - Service Worker for Manifest V3
class BrowserAssistantBackground {
  constructor() {
    this.setupEventListeners();
    this.taskQueue = [];
    this.isProcessing = false;
  }

  setupEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.initializeExtension();
      }
    });

    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        this.onTabComplete(tabId, tab);
      }
    });
  }

  async initializeExtension() {
    // Initialize storage
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        voiceEnabled: true,
        autoSummarize: false,
        openaiApiKey: '',
        deepgramApiKey: ''
      }
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'EXTRACT_CONTENT':
          const content = await this.extractPageContent(sender.tab.id);
          sendResponse({ success: true, content });
          break;

        case 'ADD_TASK':
          await this.addTask(message.task);
          sendResponse({ success: true });
          break;

        case 'VOICE_COMMAND':
          await this.processVoiceCommand(message.command, sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'GET_CALENDAR_EVENTS':
          const events = await this.getCalendarEvents();
          sendResponse({ success: true, events });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async extractPageContent(tabId) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Use Readability-like extraction
        const article = document.querySelector('article, main, .content, .post');
        if (article) {
          return {
            title: document.title,
            content: article.innerText,
            url: window.location.href,
            wordCount: article.innerText.split(' ').length
          };
        }
        
        return {
          title: document.title,
          content: document.body.innerText.substring(0, 5000),
          url: window.location.href,
          wordCount: document.body.innerText.split(' ').length
        };
      }
    });

    return results[0].result;
  }

  async addTask(task) {
    const { tasks } = await chrome.storage.local.get('tasks');
    tasks.push({
      id: Date.now().toString(),
      ...task,
      created: new Date().toISOString(),
      status: 'pending'
    });
    
    await chrome.storage.local.set({ tasks });
    this.processTaskQueue();
  }

  async processTaskQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    const { tasks } = await chrome.storage.local.get('tasks');
    
    for (const task of tasks.filter(t => t.status === 'pending')) {
      try {
        await this.executeTask(task);
        task.status = 'completed';
      } catch (error) {
        task.status = 'failed';
        task.error = error.message;
      }
    }
    
    await chrome.storage.local.set({ tasks });
    this.isProcessing = false;
  }

  async executeTask(task) {
    switch (task.type) {
      case 'summarize':
        return await this.summarizeContent(task);
      case 'send_email':
        return await this.sendEmail(task);
      case 'create_calendar_event':
        return await this.createCalendarEvent(task);
      case 'navigate':
        return await this.navigateToUrl(task);
    }
  }
}

// Initialize background service
new BrowserAssistantBackground();
```

#### 3. Content Script
```javascript
// content.js - Injected into web pages
class BrowserAssistantContent {
  constructor() {
    this.isListening = false;
    this.setupMessageListener();
    this.injectUI();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleBackgroundMessage(message, sender, sendResponse);
      return true;
    });
  }

  async handleBackgroundMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'HIGHLIGHT_ELEMENTS':
        this.highlightElements(message.selector);
        sendResponse({ success: true });
        break;

      case 'CLICK_ELEMENT':
        const clicked = this.clickElement(message.selector);
        sendResponse({ success: clicked });
        break;

      case 'FILL_FORM':
        const filled = await this.fillForm(message.data);
        sendResponse({ success: filled });
        break;
    }
  }

  injectUI() {
    // Create floating assistant button
    const assistantButton = document.createElement('div');
    assistantButton.id = 'smart-browser-assistant';
    assistantButton.innerHTML = '🤖';
    assistantButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10000;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    `;

    assistantButton.addEventListener('click', () => {
      this.toggleAssistant();
    });

    assistantButton.addEventListener('mouseenter', () => {
      assistantButton.style.transform = 'scale(1.1)';
    });

    assistantButton.addEventListener('mouseleave', () => {
      assistantButton.style.transform = 'scale(1)';
    });

    document.body.appendChild(assistantButton);
  }

  toggleAssistant() {
    const existingPanel = document.getElementById('assistant-panel');
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    this.createAssistantPanel();
  }

  createAssistantPanel() {
    const panel = document.createElement('div');
    panel.id = 'assistant-panel';
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 300px;
      height: 400px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 10001;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    panel.innerHTML = `
      <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #333;">Smart Assistant</h3>
        <button id="close-panel" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
      </div>
      
      <div style="margin-bottom: 15px;">
        <button id="voice-command" style="width: 100%; padding: 10px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🎤 Voice Command
        </button>
      </div>
      
      <div style="margin-bottom: 15px;">
        <button id="summarize-page" style="width: 100%; padding: 10px; background: #48bb78; color: white; border: none; border-radius: 5px; cursor: pointer;">
          📄 Summarize Page
        </button>
      </div>
      
      <div style="margin-bottom: 15px;">
        <button id="extract-emails" style="width: 100%; padding: 10px; background: #ed8936; color: white; border: none; border-radius: 5px; cursor: pointer;">
          📧 Extract Emails
        </button>
      </div>
      
      <div id="assistant-output" style="background: #f7fafc; padding: 10px; border-radius: 5px; min-height: 100px; font-size: 14px; color: #2d3748;">
        Ready to assist...
      </div>
    `;

    document.body.appendChild(panel);

    // Add event listeners
    panel.querySelector('#close-panel').addEventListener('click', () => {
      panel.remove();
    });

    panel.querySelector('#voice-command').addEventListener('click', () => {
      this.startVoiceCommand();
    });

    panel.querySelector('#summarize-page').addEventListener('click', () => {
      this.summarizePage();
    });

    panel.querySelector('#extract-emails').addEventListener('click', () => {
      this.extractEmails();
    });
  }

  async startVoiceCommand() {
    const output = document.getElementById('assistant-output');
    output.textContent = 'Listening for voice command...';

    try {
      // Use Web Speech API
      const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = async (event) => {
        const command = event.results[0][0].transcript;
        output.textContent = `Processing: "${command}"`;
        
        const response = await chrome.runtime.sendMessage({
          type: 'VOICE_COMMAND',
          command: command
        });

        if (response.success) {
          output.textContent = 'Command processed successfully!';
        } else {
          output.textContent = `Error: ${response.error}`;
        }
      };

      recognition.onerror = (event) => {
        output.textContent = `Voice recognition error: ${event.error}`;
      };

      recognition.start();
    } catch (error) {
      output.textContent = `Voice command not supported: ${error.message}`;
    }
  }

  async summarizePage() {
    const output = document.getElementById('assistant-output');
    output.textContent = 'Extracting and summarizing page content...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXTRACT_CONTENT'
      });

      if (response.success) {
        output.innerHTML = `
          <strong>Page Summary:</strong><br>
          <strong>Title:</strong> ${response.content.title}<br>
          <strong>Word Count:</strong> ${response.content.wordCount}<br>
          <em>Full summary processing in background...</em>
        `;
      } else {
        output.textContent = `Error: ${response.error}`;
      }
    } catch (error) {
      output.textContent = `Error: ${error.message}`;
    }
  }

  extractEmails() {
    const output = document.getElementById('assistant-output');
    
    // Extract email addresses from page
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const pageText = document.body.innerText;
    const emails = pageText.match(emailRegex) || [];
    
    const uniqueEmails = [...new Set(emails)];
    
    if (uniqueEmails.length > 0) {
      output.innerHTML = `
        <strong>Found ${uniqueEmails.length} email(s):</strong><br>
        ${uniqueEmails.map(email => `• ${email}`).join('<br>')}
      `;
    } else {
      output.textContent = 'No email addresses found on this page.';
    }
  }

  highlightElements(selector) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      el.style.outline = '3px solid #ff6b6b';
      el.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
    });

    // Remove highlights after 3 seconds
    setTimeout(() => {
      elements.forEach(el => {
        el.style.outline = '';
        el.style.backgroundColor = '';
      });
    }, 3000);
  }

  clickElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
      element.click();
      return true;
    }
    return false;
  }

  async fillForm(formData) {
    for (const [selector, value] of Object.entries(formData)) {
      const element = document.querySelector(selector);
      if (element) {
        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = value;
        } else {
          element.value = value;
          
          // Trigger input events for React/Vue compatibility
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
    return true;
  }
}

// Initialize content script
new BrowserAssistantContent();
```

### Storage Management: IndexedDB vs chrome.storage

#### 1. Chrome Storage Implementation
```javascript
class ChromeStorageManager {
  async saveData(key, data) {
    try {
      await chrome.storage.local.set({ [key]: data });
      return true;
    } catch (error) {
      console.error('Chrome storage save error:', error);
      return false;
    }
  }

  async getData(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (error) {
      console.error('Chrome storage get error:', error);
      return null;
    }
  }

  async removeData(key) {
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (error) {
      console.error('Chrome storage remove error:', error);
      return false;
    }
  }

  async getBytesInUse() {
    try {
      return await chrome.storage.local.getBytesInUse();
    } catch (error) {
      console.error('Chrome storage size error:', error);
      return 0;
    }
  }
}
```

#### 2. IndexedDB Implementation
```javascript
class IndexedDBManager {
  constructor(dbName = 'SmartBrowserDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('status', 'status', { unique: false });
          taskStore.createIndex('created', 'created', { unique: false });
        }

        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('content')) {
          const contentStore = db.createObjectStore('content', { keyPath: 'url' });
          contentStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async saveTask(task) {
    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      const request = store.put(task);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTasks(status = null) {
    const transaction = this.db.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    
    return new Promise((resolve, reject) => {
      let request;
      
      if (status) {
        const index = store.index('status');
        request = index.getAll(status);
      } else {
        request = store.getAll();
      }
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async savePageContent(url, content) {
    const transaction = this.db.transaction(['content'], 'readwrite');
    const store = transaction.objectStore('content');
    
    const data = {
      url,
      content,
      timestamp: new Date().toISOString(),
      wordCount: content.split(' ').length
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async searchContent(query) {
    const transaction = this.db.transaction(['content'], 'readonly');
    const store = transaction.objectStore('content');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const results = request.result.filter(item => 
          item.content.toLowerCase().includes(query.toLowerCase()) ||
          item.url.toLowerCase().includes(query.toLowerCase())
        );
        resolve(results);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async clearOldData(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const transaction = this.db.transaction(['content', 'sessions'], 'readwrite');
    
    // Clear old content
    const contentStore = transaction.objectStore('content');
    const contentIndex = contentStore.index('timestamp');
    const contentRange = IDBKeyRange.upperBound(cutoffDate.toISOString());
    
    contentIndex.openCursor(contentRange).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    // Clear old sessions
    const sessionStore = transaction.objectStore('sessions');
    const sessionIndex = sessionStore.index('timestamp');
    
    sessionIndex.openCursor(contentRange).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  }
}
```

#### 3. Hybrid Storage Strategy
```javascript
class HybridStorageManager {
  constructor() {
    this.chromeStorage = new ChromeStorageManager();
    this.indexedDB = new IndexedDBManager();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    await this.indexedDB.init();
    this.initialized = true;
  }

  async saveData(key, data, options = {}) {
    const { persistent = false, large = false } = options;
    
    // Use IndexedDB for large or persistent data
    if (large || persistent || JSON.stringify(data).length > 100000) {
      return await this.indexedDB.saveTask({
        id: key,
        data,
        timestamp: new Date().toISOString()
      });
    }
    
    // Use chrome.storage for small, frequently accessed data
    return await this.chromeStorage.saveData(key, data);
  }

  async getData(key, options = {}) {
    const { tryBoth = true } = options;
    
    // Try chrome.storage first (faster)
    let data = await this.chromeStorage.getData(key);
    
    if (!data && tryBoth) {
      // Fallback to IndexedDB
      const tasks = await this.indexedDB.getTasks();
      const task = tasks.find(t => t.id === key);
      data = task ? task.data : null;
    }
    
    return data;
  }

  async searchData(query) {
    // Search both storage systems
    const [chromeData, indexedData] = await Promise.all([
      this.searchChromeStorage(query),
      this.indexedDB.searchContent(query)
    ]);
    
    return [...chromeData, ...indexedData];
  }

  async searchChromeStorage(query) {
    // Chrome storage doesn't have native search, so get all and filter
    const allData = await chrome.storage.local.get();
    const results = [];
    
    for (const [key, value] of Object.entries(allData)) {
      if (typeof value === 'string' && value.includes(query)) {
        results.push({ key, value, source: 'chrome' });
      } else if (typeof value === 'object') {
        const stringified = JSON.stringify(value);
        if (stringified.includes(query)) {
          results.push({ key, value, source: 'chrome' });
        }
      }
    }
    
    return results;
  }
}
```

---

## 6. Architecture Patterns

### Task Queue Implementation

#### 1. Redis-Based Task Queue
```python
import redis
import json
import asyncio
from datetime import datetime, timedelta
from enum import Enum

class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"

class RedisTaskQueue:
    def __init__(self, redis_url="redis://localhost:6379", queue_name="browser_tasks"):
        self.redis_client = redis.from_url(redis_url)
        self.queue_name = queue_name
        self.processing_queue = f"{queue_name}:processing"
        self.failed_queue = f"{queue_name}:failed"
        self.results_queue = f"{queue_name}:results"
    
    async def add_task(self, task_type, payload, priority=0, delay=0):
        """Add task to queue with priority and delay support"""
        task = {
            'id': f"{task_type}_{datetime.now().timestamp()}",
            'type': task_type,
            'payload': payload,
            'created_at': datetime.now().isoformat(),
            'status': TaskStatus.PENDING.value,
            'retries': 0,
            'max_retries': 3
        }
        
        if delay > 0:
            # Use sorted set for delayed tasks
            execute_at = datetime.now() + timedelta(seconds=delay)
            await self.redis_client.zadd(
                f"{self.queue_name}:delayed",
                {json.dumps(task): execute_at.timestamp()}
            )
        else:
            # Use priority queue
            await self.redis_client.zadd(
                self.queue_name,
                {json.dumps(task): priority}
            )
        
        return task['id']
    
    async def get_task(self, timeout=10):
        """Get next task from queue (blocking)"""
        # First, move any ready delayed tasks to main queue
        await self._process_delayed_tasks()
        
        # Get highest priority task
        result = await self.redis_client.bzpopmax(self.queue_name, timeout=timeout)
        
        if result:
            queue_name, task_json, priority = result
            task = json.loads(task_json)
            
            # Move to processing queue for reliability
            task['status'] = TaskStatus.IN_PROGRESS.value
            task['started_at'] = datetime.now().isoformat()
            
            await self.redis_client.lpush(
                self.processing_queue,
                json.dumps(task)
            )
            
            return task
        
        return None
    
    async def complete_task(self, task_id, result=None):
        """Mark task as completed"""
        task = await self._find_processing_task(task_id)
        if task:
            task['status'] = TaskStatus.COMPLETED.value
            task['completed_at'] = datetime.now().isoformat()
            task['result'] = result
            
            # Remove from processing queue
            await self.redis_client.lrem(self.processing_queue, 1, json.dumps(task))
            
            # Store result
            await self.redis_client.setex(
                f"{self.results_queue}:{task_id}",
                3600,  # 1 hour TTL
                json.dumps(task)
            )
    
    async def fail_task(self, task_id, error):
        """Mark task as failed or retry"""
        task = await self._find_processing_task(task_id)
        if not task:
            return
        
        task['retries'] += 1
        task['last_error'] = str(error)
        task['failed_at'] = datetime.now().isoformat()
        
        # Remove from processing queue
        await self.redis_client.lrem(self.processing_queue, 1, json.dumps(task))
        
        if task['retries'] < task['max_retries']:
            # Retry with exponential backoff
            delay = 2 ** task['retries']
            task['status'] = TaskStatus.RETRY.value
            
            execute_at = datetime.now() + timedelta(seconds=delay)
            await self.redis_client.zadd(
                f"{self.queue_name}:delayed",
                {json.dumps(task): execute_at.timestamp()}
            )
        else:
            # Move to failed queue
            task['status'] = TaskStatus.FAILED.value
            await self.redis_client.lpush(self.failed_queue, json.dumps(task))
    
    async def _process_delayed_tasks(self):
        """Move ready delayed tasks to main queue"""
        now = datetime.now().timestamp()
        
        # Get ready tasks
        ready_tasks = await self.redis_client.zrangebyscore(
            f"{self.queue_name}:delayed",
            0, now,
            withscores=True
        )
        
        for task_json, score in ready_tasks:
            task = json.loads(task_json)
            
            # Move to main queue
            await self.redis_client.zadd(
                self.queue_name,
                {task_json: 0}  # Default priority
            )
            
            # Remove from delayed queue
            await self.redis_client.zrem(f"{self.queue_name}:delayed", task_json)
    
    async def _find_processing_task(self, task_id):
        """Find task in processing queue"""
        processing_tasks = await self.redis_client.lrange(self.processing_queue, 0, -1)
        
        for task_json in processing_tasks:
            task = json.loads(task_json)
            if task['id'] == task_id:
                return task
        
        return None
    
    async def get_queue_stats(self):
        """Get queue statistics"""
        return {
            'pending': await self.redis_client.zcard(self.queue_name),
            'processing': await self.redis_client.llen(self.processing_queue),
            'failed': await self.redis_client.llen(self.failed_queue),
            'delayed': await self.redis_client.zcard(f"{self.queue_name}:delayed")
        }
```

#### 2. Celery Integration
```python
from celery import Celery
from kombu import Queue
import logging

# Celery configuration
app = Celery('browser_automation')
app.config_from_object({
    'broker_url': 'redis://localhost:6379/0',
    'result_backend': 'redis://localhost:6379/0',
    'task_serializer': 'json',
    'accept_content': ['json'],
    'result_serializer': 'json',
    'timezone': 'UTC',
    'enable_utc': True,
    'task_routes': {
        'browser_automation.tasks.high_priority.*': {'queue': 'high_priority'},
        'browser_automation.tasks.low_priority.*': {'queue': 'low_priority'},
    },
    'task_default_queue': 'default',
    'task_queues': [
        Queue('high_priority', routing_key='high_priority'),
        Queue('default', routing_key='default'),
        Queue('low_priority', routing_key='low_priority'),
    ],
    'worker_prefetch_multiplier': 1,
    'task_acks_late': True,
    'worker_disable_rate_limits': False,
    'task_compression': 'gzip',
    'result_compression': 'gzip'
})

@app.task(bind=True, max_retries=3)
def extract_youtube_transcript(self, video_url):
    """Extract YouTube transcript task"""
    try:
        from .extractors import YouTubeTranscriptExtractor
        
        extractor = YouTubeTranscriptExtractor()
        transcript = extractor.get_transcript(video_url)
        
        return {
            'success': True,
            'transcript': transcript,
            'video_url': video_url
        }
    
    except Exception as exc:
        logger.error(f"YouTube extraction failed: {exc}")
        raise self.retry(exc=exc, countdown=60, max_retries=3)

@app.task(bind=True, max_retries=3)
def summarize_content(self, content, task_id=None):
    """Summarize content using Claude API"""
    try:
        from .ai_services import ClaudeClient
        
        claude = ClaudeClient()
        summary = claude.summarize(content)
        
        return {
            'success': True,
            'summary': summary,
            'task_id': task_id
        }
    
    except Exception as exc:
        logger.error(f"Summarization failed: {exc}")
        raise self.retry(exc=exc, countdown=60, max_retries=3)

@app.task(bind=True, max_retries=3, queue='high_priority')
def send_email(self, to, subject, body, task_id=None):
    """Send email via Gmail API"""
    try:
        from .api_clients import GmailAPIClient
        
        gmail = GmailAPIClient()
        result = gmail.send_email(to, subject, body)
        
        return {
            'success': True,
            'message_id': result.get('id'),
            'task_id': task_id
        }
    
    except Exception as exc:
        logger.error(f"Email send failed: {exc}")
        raise self.retry(exc=exc, countdown=60, max_retries=3)

@app.task(bind=True, max_retries=3)
def automate_browser_action(self, action_type, parameters, task_id=None):
    """Execute browser automation action"""
    try:
        from .browser_automation import BrowserController
        
        browser = BrowserController()
        result = browser.execute_action(action_type, parameters)
        
        return {
            'success': True,
            'result': result,
            'task_id': task_id
        }
    
    except Exception as exc:
        logger.error(f"Browser automation failed: {exc}")
        raise self.retry(exc=exc, countdown=60, max_retries=3)

# Task orchestration
@app.task
def process_voice_command(command_text, context=None):
    """Process voice command with task chaining"""
    from celery import chain, group
    
    # Parse command intent
    intent = parse_voice_intent(command_text)
    
    if intent['action'] == 'summarize_and_email':
        # Chain: extract content -> summarize -> send email
        workflow = chain(
            extract_youtube_transcript.s(intent['url']),
            summarize_content.s(),
            send_email.s(intent['email'], f"Summary: {intent['title']}", "")
        )
        return workflow.apply_async()
    
    elif intent['action'] == 'bulk_extract':
        # Group: extract multiple URLs in parallel
        urls = intent['urls']
        job = group(extract_youtube_transcript.s(url) for url in urls)
        return job.apply_async()

def parse_voice_intent(command_text):
    """Parse voice command to extract intent and parameters"""
    # This would use NLP to parse the command
    # For now, simple keyword matching
    
    if 'summarize' in command_text.lower() and 'email' in command_text.lower():
        return {
            'action': 'summarize_and_email',
            'url': extract_url_from_text(command_text),
            'email': extract_email_from_text(command_text),
            'title': 'Voice Command Summary'
        }
    
    return {'action': 'unknown'}
```

### Context Management for Claude

#### 1. Conversation State Manager
```python
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional

class ClaudeContextManager:
    def __init__(self, redis_client, max_context_tokens=180000):
        self.redis = redis_client
        self.max_context_tokens = max_context_tokens
        self.token_estimate_ratio = 4  # ~4 chars per token
    
    async def save_conversation_turn(self, session_id: str, user_message: str, 
                                   assistant_response: str, metadata: dict = None):
        """Save a conversation turn"""
        turn = {
            'timestamp': datetime.now().isoformat(),
            'user_message': user_message,
            'assistant_response': assistant_response,
            'metadata': metadata or {},
            'tokens_estimate': len(user_message + assistant_response) // self.token_estimate_ratio
        }
        
        # Store in Redis list
        await self.redis.lpush(f"conversation:{session_id}", json.dumps(turn))
        
        # Set expiration (7 days)
        await self.redis.expire(f"conversation:{session_id}", 604800)
    
    async def get_context_for_prompt(self, session_id: str, include_system_context: bool = True) -> str:
        """Build context string for Claude prompt"""
        conversation_turns = await self.redis.lrange(f"conversation:{session_id}", 0, -1)
        
        context_parts = []
        total_tokens = 0
        
        if include_system_context:
            system_context = await self._get_system_context(session_id)
            context_parts.append(system_context)
            total_tokens += len(system_context) // self.token_estimate_ratio
        
        # Add conversation history (newest first, but reverse for chronological order)
        for turn_json in reversed(conversation_turns):
            turn = json.loads(turn_json)
            
            if total_tokens + turn['tokens_estimate'] > self.max_context_tokens:
                break
            
            context_parts.append(f"Human: {turn['user_message']}")
            context_parts.append(f"Assistant: {turn['assistant_response']}")
            total_tokens += turn['tokens_estimate']
        
        return "\n\n".join(context_parts)
    
    async def _get_system_context(self, session_id: str) -> str:
        """Get system context including user preferences and session state"""
        # Get user preferences
        prefs = await self.redis.hgetall(f"user_prefs:{session_id}")
        
        # Get current browser state
        browser_state = await self.redis.get(f"browser_state:{session_id}")
        
        # Get recent tasks
        recent_tasks = await self.redis.lrange(f"tasks:{session_id}", 0, 5)
        
        system_context = "You are a browser automation assistant. "
        
        if prefs:
            system_context += f"User preferences: {json.dumps(prefs)}. "
        
        if browser_state:
            state = json.loads(browser_state)
            system_context += f"Current page: {state.get('url', 'unknown')}. "
            system_context += f"Page title: {state.get('title', 'unknown')}. "
        
        if recent_tasks:
            tasks = [json.loads(task) for task in recent_tasks]
            system_context += f"Recent tasks: {[task.get('type') for task in tasks]}. "
        
        return system_context
    
    async def update_browser_state(self, session_id: str, url: str, title: str, 
                                 content_summary: str = None):
        """Update current browser state"""
        state = {
            'url': url,
            'title': title,
            'content_summary': content_summary,
            'timestamp': datetime.now().isoformat()
        }
        
        await self.redis.setex(
            f"browser_state:{session_id}",
            3600,  # 1 hour TTL
            json.dumps(state)
        )
    
    async def save_user_preference(self, session_id: str, key: str, value: str):
        """Save user preference"""
        await self.redis.hset(f"user_prefs:{session_id}", key, value)
        await self.redis.expire(f"user_prefs:{session_id}", 2592000)  # 30 days
    
    async def add_task_to_history(self, session_id: str, task_type: str, 
                                parameters: dict, result: dict = None):
        """Add completed task to history"""
        task = {
            'type': task_type,
            'parameters': parameters,
            'result': result,
            'timestamp': datetime.now().isoformat()
        }
        
        await self.redis.lpush(f"tasks:{session_id}", json.dumps(task))
        await self.redis.ltrim(f"tasks:{session_id}", 0, 99)  # Keep last 100 tasks
        await self.redis.expire(f"tasks:{session_id}", 604800)  # 7 days
    
    async def search_conversation_history(self, session_id: str, query: str, limit: int = 10):
        """Search conversation history"""
        conversation_turns = await self.redis.lrange(f"conversation:{session_id}", 0, -1)
        
        matching_turns = []
        for turn_json in conversation_turns:
            turn = json.loads(turn_json)
            
            if (query.lower() in turn['user_message'].lower() or 
                query.lower() in turn['assistant_response'].lower()):
                matching_turns.append(turn)
                
                if len(matching_turns) >= limit:
                    break
        
        return matching_turns
    
    async def get_session_summary(self, session_id: str):
        """Get summary of session activity"""
        conversation_count = await self.redis.llen(f"conversation:{session_id}")
        task_count = await self.redis.llen(f"tasks:{session_id}")
        
        recent_tasks = await self.redis.lrange(f"tasks:{session_id}", 0, 4)
        task_types = [json.loads(task)['type'] for task in recent_tasks]
        
        browser_state = await self.redis.get(f"browser_state:{session_id}")
        current_page = json.loads(browser_state).get('url', 'None') if browser_state else 'None'
        
        return {
            'conversation_turns': conversation_count,
            'completed_tasks': task_count,
            'recent_task_types': task_types,
            'current_page': current_page,
            'session_id': session_id
        }
```

#### 2. Memory Management for Long-Running Sessions
```python
import psutil
import gc
from dataclasses import dataclass
from typing import Dict, Any
import asyncio

@dataclass
class MemoryMetrics:
    rss_mb: float
    vms_mb: float
    percent: float
    available_mb: float

class BrowserSessionMemoryManager:
    def __init__(self, max_memory_mb=2048, cleanup_threshold=0.8):
        self.max_memory_mb = max_memory_mb
        self.cleanup_threshold = cleanup_threshold
        self.browser_instances = {}
        self.page_cache = {}
        self.monitoring_active = False
    
    async def start_monitoring(self):
        """Start memory monitoring loop"""
        self.monitoring_active = True
        asyncio.create_task(self._monitor_memory_loop())
    
    async def _monitor_memory_loop(self):
        """Monitor memory usage and trigger cleanup when needed"""
        while self.monitoring_active:
            try:
                metrics = self._get_memory_metrics()
                
                if metrics.percent > self.cleanup_threshold:
                    await self._perform_memory_cleanup(metrics)
                
                await asyncio.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                print(f"Memory monitoring error: {e}")
                await asyncio.sleep(60)
    
    def _get_memory_metrics(self) -> MemoryMetrics:
        """Get current memory usage metrics"""
        process = psutil.Process()
        memory_info = process.memory_info()
        memory_percent = process.memory_percent()
        
        virtual_memory = psutil.virtual_memory()
        
        return MemoryMetrics(
            rss_mb=memory_info.rss / 1024 / 1024,
            vms_mb=memory_info.vms / 1024 / 1024,
            percent=memory_percent,
            available_mb=virtual_memory.available / 1024 / 1024
        )
    
    async def _perform_memory_cleanup(self, metrics: MemoryMetrics):
        """Perform memory cleanup operations"""
        print(f"Memory cleanup triggered. Usage: {metrics.percent:.1f}% ({metrics.rss_mb:.1f}MB)")
        
        # 1. Close idle browser pages
        await self._cleanup_idle_pages()
        
        # 2. Clear page cache
        await self._clear_page_cache()
        
        # 3. Force garbage collection
        gc.collect()
        
        # 4. If still high memory usage, restart browser instances
        updated_metrics = self._get_memory_metrics()
        if updated_metrics.percent > 0.9:
            await self._restart_browser_instances()
    
    async def _cleanup_idle_pages(self):
        """Close browser pages that have been idle"""
        current_time = datetime.now()
        idle_threshold = timedelta(minutes=15)
        
        for session_id, browser_data in list(self.browser_instances.items()):
            browser = browser_data['browser']
            last_activity = browser_data.get('last_activity', current_time)
            
            if current_time - last_activity > idle_threshold:
                try:
                    # Close all pages except the first one
                    pages = await browser.pages()
                    for page in pages[1:]:  # Keep at least one page open
                        await page.close()
                    
                    print(f"Closed idle pages for session: {session_id}")
                    
                except Exception as e:
                    print(f"Error closing idle pages: {e}")
    
    async def _clear_page_cache(self):
        """Clear cached page content"""
        cache_size_before = len(self.page_cache)
        
        # Keep only recent cache entries
        current_time = datetime.now()
        cache_ttl = timedelta(hours=1)
        
        expired_keys = []
        for key, data in self.page_cache.items():
            if current_time - data.get('timestamp', current_time) > cache_ttl:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.page_cache[key]
        
        print(f"Cache cleanup: {cache_size_before} -> {len(self.page_cache)} entries")
    
    async def _restart_browser_instances(self):
        """Restart browser instances to free memory"""
        print("Restarting browser instances due to high memory usage")
        
        for session_id, browser_data in list(self.browser_instances.items()):
            try:
                old_browser = browser_data['browser']
                
                # Save current page URLs
                pages = await old_browser.pages()
                page_urls = []
                for page in pages:
                    try:
                        page_urls.append(page.url)
                    except:
                        pass
                
                # Close old browser
                await old_browser.close()
                
                # Create new browser
                from playwright.async_api import async_playwright
                playwright = await async_playwright().start()
                new_browser = await playwright.chromium.launch(
                    headless=False,
                    args=['--memory-pressure-off', '--max_old_space_size=1024']
                )
                
                # Restore pages
                for url in page_urls[:3]:  # Limit to 3 pages
                    try:
                        page = await new_browser.new_page()
                        await page.goto(url)
                    except:
                        pass
                
                # Update browser instance
                self.browser_instances[session_id] = {
                    'browser': new_browser,
                    'playwright': playwright,
                    'last_activity': datetime.now()
                }
                
                print(f"Restarted browser instance for session: {session_id}")
                
            except Exception as e:
                print(f"Error restarting browser instance: {e}")
    
    async def register_browser_instance(self, session_id: str, browser, playwright):
        """Register a browser instance for monitoring"""
        self.browser_instances[session_id] = {
            'browser': browser,
            'playwright': playwright,
            'last_activity': datetime.now()
        }
    
    async def update_activity(self, session_id: str):
        """Update last activity time for a session"""
        if session_id in self.browser_instances:
            self.browser_instances[session_id]['last_activity'] = datetime.now()
    
    async def cache_page_content(self, url: str, content: dict):
        """Cache page content with memory limits"""
        # Limit cache size
        if len(self.page_cache) > 100:
            # Remove oldest entries
            oldest_key = min(self.page_cache.keys(), 
                           key=lambda k: self.page_cache[k].get('timestamp', datetime.min))
            del self.page_cache[oldest_key]
        
        self.page_cache[url] = {
            'content': content,
            'timestamp': datetime.now()
        }
    
    def get_memory_stats(self) -> Dict[str, Any]:
        """Get current memory statistics"""
        metrics = self._get_memory_metrics()
        
        return {
            'memory_usage_mb': metrics.rss_mb,
            'memory_percent': metrics.percent,
            'available_mb': metrics.available_mb,
            'browser_instances': len(self.browser_instances),
            'cached_pages': len(self.page_cache),
            'cleanup_threshold': self.cleanup_threshold
        }
```

---

## 7. Implementation Recommendations

### MVP Architecture Recommendation

Based on the research, here's the recommended architecture for building a Comet Browser-like automation assistant:

#### 1. Core Technology Stack

**Browser Automation**: Use **Playwright** over Puppeteer for:
- Multi-browser support (Chrome, Firefox, WebKit)
- Better auto-waiting mechanisms
- Superior performance and reliability
- Active development and modern APIs

**Voice-to-Text**: Use **Deepgram** for real-time voice commands:
- 40x faster inference than alternatives
- <300ms latency for real-time processing
- Lower pricing ($0.0043/minute vs $0.0060/minute)
- Excellent streaming support

**Content Extraction**: Implement hybrid approach:
- **Readability.js** for article extraction
- **youtube-transcript-api** for YouTube content
- Custom DOM parsing for site-specific extraction

**Task Queue**: Use **Redis + Celery** combination:
- Redis for lightweight task storage and caching
- Celery for complex task orchestration
- Built-in retry mechanisms and error handling

#### 2. Security Implementation

```python
# Centralized security configuration
SECURITY_CONFIG = {
    'oauth': {
        'token_encryption': True,
        'refresh_token_rotation': True,
        'max_token_age': 3600,  # 1 hour
        'secure_storage': True
    },
    'browser': {
        'sandbox_mode': True,
        'process_isolation': True,
        'max_session_time': 1800,  # 30 minutes
        'memory_limit_mb': 2048
    },
    'api': {
        'rate_limiting': True,
        'request_signing': True,
        'audit_logging': True,
        'ip_whitelisting': True
    }
}
```

#### 3. Modular Architecture

```
smart-browser-assistant/
├── core/
│   ├── browser_automation/     # Playwright wrapper
│   ├── voice_processing/       # Deepgram integration
│   ├── content_extraction/     # Readability + custom extractors
│   └── ai_integration/         # Claude API client
├── apis/
│   ├── gmail_client.py         # Gmail API wrapper
│   ├── calendar_client.py      # Calendar API wrapper
│   └── linkedin_automation.py  # LinkedIn workarounds
├── queue/
│   ├── redis_queue.py          # Task queue implementation
│   ├── celery_tasks.py         # Async task definitions
│   └── context_manager.py      # Claude context management
├── extension/
│   ├── manifest.json           # WebExtension manifest
│   ├── background.js           # Service worker
│   ├── content.js              # Content script
│   └── popup.html              # Extension UI
├── storage/
│   ├── hybrid_storage.py       # IndexedDB + chrome.storage
│   ├── memory_manager.py       # Memory monitoring
│   └── session_manager.py      # Session persistence
└── security/
    ├── oauth_manager.py        # OAuth2 implementation
    ├── token_manager.py        # Secure token storage
    └── rate_limiter.py         # API rate limiting
```

#### 4. Development Phases

**Phase 1: Core Infrastructure (Weeks 1-2)**
- Set up Playwright browser automation
- Implement basic voice command recognition
- Create Redis task queue system
- Build Chrome extension foundation

**Phase 2: Content Processing (Weeks 3-4)**
- Integrate YouTube transcript extraction
- Implement article content extraction
- Add Claude API for summarization
- Create context management system

**Phase 3: API Integrations (Weeks 5-6)**
- Gmail API OAuth and email sending
- Google Calendar event management
- LinkedIn automation with rate limiting
- Security hardening and token management

**Phase 4: Advanced Features (Weeks 7-8)**
- Memory management for long sessions
- Advanced task orchestration
- Real-time voice processing
- Performance optimization

#### 5. Performance Optimization

```python
# Performance monitoring configuration
PERFORMANCE_CONFIG = {
    'memory': {
        'max_browser_instances': 5,
        'page_cache_limit': 100,
        'cleanup_threshold': 0.8,
        'session_timeout': 1800
    },
    'task_queue': {
        'max_concurrent_tasks': 10,
        'retry_exponential_backoff': True,
        'task_timeout': 300,
        'result_ttl': 3600
    },
    'api_limits': {
        'gmail_requests_per_minute': 100,
        'calendar_requests_per_minute': 600,
        'linkedin_connections_per_day': 80,
        'voice_processing_concurrent': 3
    }
}
```

#### 6. Monitoring and Observability

```python
# Monitoring setup
import logging
from prometheus_client import Counter, Histogram, Gauge

# Metrics
task_counter = Counter('tasks_total', 'Total tasks processed', ['task_type', 'status'])
task_duration = Histogram('task_duration_seconds', 'Task processing time', ['task_type'])
memory_usage = Gauge('memory_usage_bytes', 'Current memory usage')
browser_sessions = Gauge('browser_sessions_active', 'Active browser sessions')

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('smart_browser.log'),
        logging.StreamHandler()
    ]
)
```

This architecture provides a solid foundation for building a production-ready browser automation assistant similar to Comet Browser, with proper security, scalability, and maintainability considerations built in from the start.