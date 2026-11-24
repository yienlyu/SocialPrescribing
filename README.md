# 社會處方・B 共同擬定處方（虛擬 Link Worker）

醫學人文課程作品。以 CUSP 框架（Muhl et al., 2023；2024）中的 **B：共同擬定處方** 為主題，
以團隊蒐集、臺北實際存在的社會處方為資源，服務對象為社區居民（各年齡層的當事人與照顧者）。
網站扮演虛擬 link worker：接收第一組（A 識別需求）轉介來的居民，透過對話共同擬定處方，
最後產出處方籤與轉介單，refer 到資源端（C）。

## 功能
- **Healthy People 2030**：介紹健康的社會決定因素（SDOH）五大領域，並對應到本站的需求選項與處方分類；處方籤會自動標出回應了哪幾個領域（對應表在 `data.js` 的 `SP.HP2030`）
- **處方工作台**（5 步）：接收轉介 → 對話（What matters to you?）→ 媒合地圖 → 共同決定 → 處方籤／轉介單
- **轉介連結**：第一組在「對話」步驟填好需求後按「複製轉介連結」，連結打開就會帶入該位居民
- **社區處方庫**：實際存在的處方，依 9 類篩選、關鍵字搜尋，每張附場域、對象、提供單位與原始連結，可直接放進候選
- 列印處方籤、複製轉介文字；進度只存在瀏覽器 localStorage，不收集個資

## 檔案
- `index.html` 頁面結構與文案
- `styles.css` 視覺樣式（延續論文資訊圖表的米白／墨黑／朱紅）
- `data.js` 需求、興趣、阻礙、處方資料、示範居民（要改內容改這裡）
- `app.js` 互動與媒合計分邏輯

純靜態網站，無需建置。本機預覽：`python3 -m http.server`，打開 http://localhost:8000

## 參考文獻
- Muhl C, Mulligan K, Giurca BC, et al. *BMC Health Serv Res* 2024;24:1280. doi:10.1186/s12913-024-11603-x
- Muhl C, et al. *BMJ Open* 2023;13:e070184.
- U.S. DHHS, ODPHP. *Healthy People 2030: Social Determinants of Health.* health.gov/healthypeople
