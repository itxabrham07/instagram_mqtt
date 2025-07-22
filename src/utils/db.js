import { MongoClient } from 'mongodb';
import { config } from '../config.js';
import { logger } from './utils.js';

let client = null;
let db = null;

export async function connectDb() {
  if (db) {
    return db;
  }

  try {
    logger.info('🔌 Connecting to MongoDB...');
    
    client = new MongoClient(config.database.url, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db();
    
    logger.info('✅ MongoDB connected successfully');
    return db;
    
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

export async function disconnectDb() {
  if (client) {
    try {
      await client.close();
      client = null;
      db = null;
      logger.info('✅ MongoDB disconnected');
    } catch (error) {
      logger.error('❌ MongoDB disconnect error:', error.message);
    }
  }
}

// Database utilities
export const dbUtils = {
  async saveMessage(message) {
    try {
      const db = await connectDb();
      const collection = db.collection('messages');
      
      const messageDoc = {
        ...message,
        createdAt: new Date(),
        processed: true
      };
      
      await collection.insertOne(messageDoc);
      return true;
    } catch (error) {
      logger.error('Failed to save message:', error.message);
      return false;
    }
  },

  async getMessageHistory(threadId, limit = 50) {
    try {
      const db = await connectDb();
      const collection = db.collection('messages');
      
      const messages = await collection
        .find({ threadId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return messages.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Failed to get message history:', error.message);
      return [];
    }
  },

  async saveUserStats(userId, username, stats) {
    try {
      const db = await connectDb();
      const collection = db.collection('user_stats');
      
      await collection.updateOne(
        { userId },
        {
          $set: {
            username,
            ...stats,
            lastUpdated: new Date()
          },
          $inc: {
            totalMessages: 1
          }
        },
        { upsert: true }
      );
      
      return true;
    } catch (error) {
      logger.error('Failed to save user stats:', error.message);
      return false;
    }
  },

  async getUserStats(userId) {
    try {
      const db = await connectDb();
      const collection = db.collection('user_stats');
      
      return await collection.findOne({ userId });
    } catch (error) {
      logger.error('Failed to get user stats:', error.message);
      return null;
    }
  }
};