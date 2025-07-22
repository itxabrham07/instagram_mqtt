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

  async hasCookies() {
    try {
      // Check DB only if enabled
      if (config.database?.enabled) {
        // Check DB first
        if (!this.db) {
          this.db = await connectDb();
        }
        const cookies = this.db.collection('cookies');
        const cookieDoc = await cookies.findOne({ username: config.instagram.username });
        
        if (cookieDoc && cookieDoc.cookieData) {
          return true;
        }
      }
      
      // Check file
      return await fileUtils.pathExists(this.cookiesPath);