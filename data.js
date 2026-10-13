/* =========================================================
   信義社會處方社區（虛擬）：資料層
   對象：學齡前兒童（0–6 歲）的家庭與主要照顧者
   - NEEDS / INTERESTS / BARRIERS：虛擬 link worker 與家長對話的共同語言
   - RESOURCES：社區中的 20 種處方籤（C 連結資源）
   - CASES：第一組（A 識別需求）轉介過來的示範家庭
   ========================================================= */

window.SP = window.SP || {};

SP.CATS = {
  read:   { label: "閱讀", en: "Reading" },
  move:   { label: "運動", en: "Movement" },
  art:    { label: "藝術", en: "Arts" },
  nature: { label: "自然", en: "Nature" },
  mutual: { label: "互助", en: "Mutual aid" },
  mind:   { label: "心理", en: "Wellbeing" },
  life:   { label: "社福支持", en: "Social welfare" }
};

SP.NEEDS = {
  isolate:   "照顧者孤立、整天在家",
  mood:      "照顧者情緒低落、壓力大",
  parenting: "育兒知識與信心不足",
  dev:       "擔心孩子發展（語言、動作）",
  screen:    "螢幕時間多、親子互動少",
  play:      "缺少安全的遊戲空間",
  respite:   "需要托育或喘息",
  money:     "經濟壓力",
  housing:   "居住擁擠、環境衛生",
  food:      "營養與食物不足",
  job:       "就業、重返職場",
  culture:   "語言與文化適應"
};

SP.INTERESTS = {
  story:  "說故事、看繪本",
  music:  "唱歌、律動",
  nature: "公園、大自然",
  make:   "手作、畫畫",
  move:   "跑跑跳跳、運動",
  cook:   "煮飯、一起吃",
  talk:   "跟其他爸媽聊天",
  learn:  "學新的育兒方法",
  help:   "幫忙別人、當志工",
  art:    "看展、博物館"
};

SP.BARRIERS = {
  time:      { label: "只有晚上或週末有空", tip: "找晚間、週末或時間彈性的方案" },
  money:     { label: "預算有限", tip: "優先免費資源，或同時申請補助" },
  little:    { label: "孩子還很小，出門不容易", tip: "就近、到宅或線上方案優先" },
  transport: { label: "交通不便、推車難行", tip: "選擇步行可達或到宅服務" },
  anxiety:   { label: "不太敢進陌生團體", tip: "先從一對一或小團體開始，可陪同第一次" },
  care:      { label: "家裡還有其他人要照顧", tip: "可帶手足同行、或先申請臨托" },
  language:  { label: "中文不太流利", tip: "提供母語、通譯或少文字的方案" }
};

SP.SOCIAL = { solo: "一對一就好", small: "小團體", large: "熱鬧的大團體", any: "都可以" };
SP.SETTING = { indoor: "室內", outdoor: "戶外", any: "都可以" };

/* social: 1on1 | small | large   cost: 0 免費 / 1 低費用
   time: weekday | evening | weekend | flex   reach: near（步行可達）| home（到宅/線上）| far
   entry: 1 低門檻 / 2 / 3 需較多準備 */
SP.RESOURCES = [
  /* ---------- 閱讀 ---------- */
  { id: "bookstart", no: "01", cat: "read", name: "閱讀起步走：繪本處方",
    desc: "領一袋適齡繪本與共讀手冊，每天睡前 10 分鐘就是一次處方。",
    provider: "市立圖書館分館", needs: ["screen","parenting","dev"], interests: ["story","learn"],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday","weekend","flex"], reach: "near", entry: 1,
    first: "這週到圖書館領取閱讀禮袋，挑一本今晚一起讀。" },
  { id: "storytime", no: "02", cat: "read", name: "圖書館說故事時間",
    desc: "志工姊姊帶著唱、演、讀，孩子聽故事，家長認識彼此。",
    provider: "市立圖書館分館", needs: ["isolate","screen","dev"], interests: ["story","talk","music"],
    social: "large", setting: "indoor", cost: 0, time: ["weekday","weekend"], reach: "near", entry: 1,
    first: "週六上午先來聽一場，坐在後排也可以。" },
  { id: "mother", no: "03", cat: "read", name: "母語繪本共讀",
    desc: "越南語、印尼語等雙語繪本與共讀班，母語也是孩子的資產。",
    provider: "新住民家庭服務中心 × 圖書館", needs: ["culture","isolate","dev","parenting"], interests: ["story","talk"],
    social: "small", setting: "indoor", cost: 0, time: ["weekend","flex"], reach: "near", entry: 1,
    first: "借一本母語繪本，下次共讀班用母語讀給大家聽。" },
  { id: "homestory", no: "04", cat: "read", name: "到宅說故事志工",
    desc: "志工每週到家裡讀繪本，示範怎麼讀，家長在旁邊學。",
    provider: "家庭教育中心", needs: ["screen","parenting","isolate","dev"], interests: ["story","learn"],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday","evening","flex"], reach: "home", entry: 1,
    first: "約好下週三傍晚，志工第一次到家拜訪。" },

  /* ---------- 運動 ---------- */
  { id: "kidmove", no: "05", cat: "move", name: "幼兒體能律動課",
    desc: "爬、滾、跳的感覺統合遊戲，孩子放電，大人也一起動。",
    provider: "運動中心", needs: ["dev","screen","play"], interests: ["move","music"],
    social: "large", setting: "indoor", cost: 1, time: ["weekday","weekend"], reach: "near", entry: 2,
    first: "報名一堂體驗課，穿輕便衣服和孩子一起上。" },
  { id: "stroller", no: "06", cat: "move", name: "推車健走團",
    desc: "爸媽推著嬰兒車在公園走一圈，邊走邊聊，運動也交朋友。",
    provider: "健康服務中心", needs: ["isolate","mood","play"], interests: ["move","nature","talk"],
    social: "large", setting: "outdoor", cost: 0, time: ["weekday"], reach: "near", entry: 1,
    first: "週二早上九點公園入口集合，先走半圈就好。" },

  /* ---------- 藝術 ---------- */
  { id: "sing", no: "07", cat: "art", name: "親子唱遊音樂班",
    desc: "童謠、手指謠與敲敲打打，語言發展在節奏裡慢慢長出來。",
    provider: "社區大學", needs: ["dev","screen","isolate"], interests: ["music","talk"],
    social: "small", setting: "indoor", cost: 1, time: ["weekday","weekend"], reach: "near", entry: 2,
    first: "試上一堂，把孩子最愛的那首歌告訴老師。" },
  { id: "craft", no: "08", cat: "art", name: "親子手作與塗鴉工作坊",
    desc: "弄髒也沒關係的創作時間，用回收材料就能玩一整個下午。",
    provider: "社區發展協會", needs: ["screen","isolate","mood"], interests: ["make","art","talk"],
    social: "small", setting: "indoor", cost: 0, time: ["weekend"], reach: "near", entry: 1,
    first: "帶一個紙箱來，跟孩子一起做一台車。" },
  { id: "museum", no: "09", cat: "art", name: "博物館親子處方",
    desc: "小團體導覽，以提問帶孩子看作品，也給大人一段安靜的時光。",
    provider: "美術館 × 博物館", needs: ["mood","isolate","parenting"], interests: ["art","learn"],
    social: "small", setting: "indoor", cost: 0, time: ["weekday","weekend"], reach: "far", entry: 2,
    first: "預約平日上午的親子場，憑處方籤免費入館。" },

  /* ---------- 自然 ---------- */
  { id: "explore", no: "10", cat: "nature", name: "公園自然探索",
    desc: "找葉子、看昆蟲、聽鳥叫，由自然引導員帶著親子慢慢玩。",
    provider: "公園處 × 自然引導員", needs: ["screen","play","mood","dev"], interests: ["nature","move"],
    social: "small", setting: "outdoor", cost: 0, time: ["weekend"], reach: "near", entry: 1,
    first: "週日早上帶一個小袋子，來公園撿五種不同的葉子。" },
  { id: "farm", no: "11", cat: "nature", name: "社區親子農園",
    desc: "一家一格小菜圃，種菜、澆水、收成，再一起煮來吃。",
    provider: "社區發展協會", needs: ["play","food","isolate","mood"], interests: ["nature","cook","make"],
    social: "small", setting: "outdoor", cost: 0, time: ["weekend","flex"], reach: "near", entry: 2,
    first: "認領一盆小番茄，先在家陽台照顧兩週。" },

  /* ---------- 互助 ---------- */
  { id: "playhub", no: "12", cat: "mutual", name: "親子館自由遊戲",
    desc: "安全乾淨的室內遊戲空間，有托育人員可以聊育兒大小事。",
    provider: "區親子館", needs: ["play","isolate","parenting","housing"], interests: ["talk","move"],
    social: "large", setting: "indoor", cost: 0, time: ["weekday","weekend"], reach: "near", entry: 1,
    first: "線上預約一個時段，帶孩子去玩一個小時。" },
  { id: "coop", no: "13", cat: "mutual", name: "爸媽共學團",
    desc: "五六個家庭輪流帶活動，孩子有玩伴，家長有隊友。",
    provider: "家長自組 × 社區據點", needs: ["isolate","mood","parenting","respite"], interests: ["talk","help","story"],
    social: "small", setting: "any", cost: 0, time: ["weekday","weekend","flex"], reach: "near", entry: 2,
    first: "先跟一次共學團的戶外日，看看氣氛合不合。" },
  { id: "newfam", no: "14", cat: "mutual", name: "新住民家庭支持站",
    desc: "同鄉姊妹聚會、通譯協助與在地生活資訊，不必一個人摸索。",
    provider: "新住民家庭服務中心", needs: ["culture","isolate","mood","job"], interests: ["talk","cook","help"],
    social: "small", setting: "indoor", cost: 0, time: ["weekday","weekend"], reach: "near", entry: 1,
    first: "參加這個月的家鄉料理聚會，帶孩子一起來。" },
  { id: "respite", no: "15", cat: "mutual", name: "臨時托育與喘息服務",
    desc: "由合格托育人員短時間照顧孩子，讓主要照顧者休息或就醫。",
    provider: "托育資源中心", needs: ["respite","mood","job"], interests: [],
    social: "1on1", setting: "indoor", cost: 1, time: ["weekday","evening","flex"], reach: "near", entry: 2,
    first: "先申請一次 3 小時臨托，把那段時間留給自己。" },

  /* ---------- 心理 ---------- */
  { id: "mindcare", no: "16", cat: "mind", name: "家長心理諮詢",
    desc: "免費晤談，產後情緒、育兒壓力都可以在這裡被好好聽見。",
    provider: "社區心理衛生中心", needs: ["mood","isolate"], interests: ["talk"],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday","evening"], reach: "home", entry: 2,
    first: "預約一次 50 分鐘初談，可以選視訊進行。" },

  /* ---------- 社福支持 ---------- */
  { id: "subsidy", no: "17", cat: "life", name: "育兒津貼與托育補助",
    desc: "一次盤點可申請的育兒津貼、托育與弱勢家庭補助。",
    provider: "社會局 × 區公所", needs: ["money","respite","job"], interests: [],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday"], reach: "far", entry: 2,
    first: "link worker 先幫你列好文件清單，一起線上申請。" },
  { id: "early", no: "18", cat: "life", name: "早期療育評估與轉介",
    desc: "擔心孩子說話或動作慢，可免費評估，及早接上療育資源。",
    provider: "早期療育通報轉介中心", needs: ["dev","parenting"], interests: ["learn"],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday"], reach: "far", entry: 3,
    first: "填寫兒童發展檢核表，由個管員協助預約評估。" },
  { id: "supply", no: "19", cat: "life", name: "物資與居住協助",
    desc: "實物銀行、尿布奶粉、居家環境清潔與租屋補貼諮詢。",
    provider: "社會福利服務中心", needs: ["food","money","housing"], interests: ["cook"],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday","weekend"], reach: "near", entry: 1,
    first: "開立轉介單，本週即可領取第一次物資。" },
  { id: "work", no: "20", cat: "life", name: "重返職場與彈性就業",
    desc: "就業諮詢、職訓課程（含托兒）、彈性工時職缺媒合。",
    provider: "就業服務站", needs: ["job","money","culture"], interests: ["learn"],
    social: "1on1", setting: "indoor", cost: 0, time: ["weekday","evening"], reach: "far", entry: 2,
    first: "預約一次職涯諮詢，可以帶孩子一起來。" }
];

/* 第一組（A 識別需求）轉介過來的示範家庭 */
SP.CASES = [
  { id: "yun", name: "小芸", meta: "32 歲・全職媽媽", child: "女兒 1 歲半", from: "兒科疫苗門診",
    note: "打疫苗時說：「我已經一個禮拜沒跟大人講話了。」先生工時長，孩子常看手機才肯吃飯。",
    needs: ["isolate","mood","screen"], interests: ["story","talk","nature"], barriers: ["little","anxiety"],
    social: "small", setting: "any", ready: 3,
    matters: "想要有幾個可以一起帶小孩的朋友。" },
  { id: "lian", name: "阿蓮", meta: "29 歲・新住民媽媽", child: "兒子 3 歲", from: "幼兒園老師",
    note: "老師發現孩子說話比同齡慢，媽媽中文不太流利，不太敢參加家長活動。",
    needs: ["dev","culture","isolate","parenting"], interests: ["story","cook","talk"], barriers: ["language","anxiety"],
    social: "small", setting: "indoor", ready: 3,
    matters: "希望孩子會說中文，也不要忘記媽媽的話。" },
  { id: "wei", name: "志偉", meta: "36 歲・單親爸爸", child: "4 歲與 5 歲", from: "家醫科（爸爸本人就診）",
    note: "因胃痛與失眠就醫，提到房租壓力、租屋處潮濕狹小，下班後只能讓孩子看電視。",
    needs: ["money","housing","screen","respite"], interests: ["move","nature"], barriers: ["time","money"],
    social: "any", setting: "outdoor", ready: 2,
    matters: "想要週末能好好陪他們，不要只有累。" },
  { id: "chu", name: "朱阿嬤", meta: "67 歲・隔代教養", child: "孫子 2 歲", from: "健康服務中心",
    note: "子女在外地工作，阿嬤白天獨自帶孫，膝蓋不好，孫子幾乎都在看平板。",
    needs: ["screen","play","parenting","respite"], interests: ["story","music","cook"], barriers: ["transport","little"],
    social: "small", setting: "indoor", ready: 2,
    matters: "我想跟孫子多講講話，不要都給他看平板。" }
];
