// Supabase 連線設定（設定步驟見 supabase/README.md）
// 兩個值都在 Supabase 後台 → Project Settings → API（或 Data API）找得到。
// anon / publishable key 本來就設計成公開放在前端，資料安全由資料庫的權限規則（RLS）把關。
// 留空時網站照常運作，只是雲端功能（存處方、QR 報到、登入、追蹤）會顯示「尚未連線」。
window.SP_CONFIG = {
  supabaseUrl: "https://keqxcwuuwpomaekccpjz.supabase.co/rest/v1/",
  supabaseKey: "sb_publishable_TWajQ9uHkqubFGUXCp9yfw_jOHCfjjd",
};
