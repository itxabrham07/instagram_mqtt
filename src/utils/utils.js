import fs from 'fs';
import path from 'path';

// Simple logger
export const logger = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${new Date().toISOString()}`, ...args),
  debug: (...args) => console.log(`[DEBUG] ${new Date().toISOString()}`, ...args)
};

// File utilities
export const fileUtils = {
  async pathExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  async ensureDir(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      logger.error('Failed to create directory:', error.message);
      return false;
    }
  },

  async readJson(filePath) {
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read JSON file:', error.message);
      return null;
    }
  },

  async writeJson(filePath, data) {
    try {
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      logger.error('Failed to write JSON file:', error.message);
      return false;
    }
  }
};

// Rate limiting utilities
export class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  isLimited(key, maxRequests = 5, windowMs = 60000) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const userRequests = this.requests.get(key);
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => time > windowStart);
    this.requests.set(key, validRequests);
    
    if (validRequests.length >= maxRequests) {
      return true; // Rate limited
    }
    
    // Add current request
    validRequests.push(now);
    return false; // Not rate limited
  }

  clear(key) {
    this.requests.delete(key);
  }

  clearAll() {
    this.requests.clear();
  }
}

// Text utilities
export const textUtils = {
  truncate(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  },

  escapeMarkdown(text) {
    return text.replace(/[*_`[\]()~>#+=|{}.!-]/g, '\\$&');
  },

  extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  },

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
};

// Async utilities
export const asyncUtils = {
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async retry(fn, maxAttempts = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }
        logger.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await this.delay(delayMs);
      }
    }
  },

  async timeout(promise, ms) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), ms);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }
};