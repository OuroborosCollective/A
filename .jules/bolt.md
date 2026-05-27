## 2025-05-14 - Added index on messages.conversation_id

**Learning:** Database tables with foreign keys that are frequently used for filtering (like `conversation_id` in a `messages` table) should always be indexed to avoid full table scans as the dataset grows. In this application, retrieving all messages for a specific conversation is a core operation.

**Action:** Added `index` to the `messages` table on the `conversation_id` column using Drizzle ORM.

**Predicted Performance Impact:**
- **Before:** A query like `SELECT * FROM messages WHERE conversation_id = $1` would perform a `Seq Scan` (Sequential Scan), which is O(n) where n is the total number of messages in the database.
- **After:** The same query will perform an `Index Scan`, which is O(log n). This significantly reduces latency as the `messages` table grows.

**Predicted EXPLAIN Plan:**
```sql
-- BEFORE
EXPLAIN SELECT * FROM messages WHERE conversation_id = 123;
-- Query Plan: Seq Scan on messages (cost=0.00..35.50 rows=5 width=1024)
--              Filter: (conversation_id = 123)

-- AFTER
EXPLAIN SELECT * FROM messages WHERE conversation_id = 123;
-- Query Plan: Index Scan using messages_conversation_id_idx on messages (cost=0.28..8.30 rows=5 width=1024)
--              Index Cond: (conversation_id = 123)
```
