@@ .. @@
   async loadCookiesFromDb() {
     try {
+      // Skip DB operations if MongoDB is disabled
+      if (!config.database?.enabled) {
+        return false;
+      }
+
       if (!this.db) {
         this.db = await connectDb();
       }
     } catch (error) {
       console.error('Error loading cookies from database:', error);
       return false;
     }
   }