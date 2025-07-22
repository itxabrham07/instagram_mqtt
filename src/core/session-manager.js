async loadCookiesFromDb() {
  try {
   // Skip DB operations if MongoDB is disabled
   if (!config.database?.enabled) {
     logger.info('📝 MongoDB disabled, skipping database save');
     return;
   }

   // Skip DB operations if MongoDB is disabled
   if (!config.database?.enabled) {
     return false;
   }

    if (!this.db) {
      this.db = await connectDb();
    }
  } catch (error) {
    // Handle error
  }
}