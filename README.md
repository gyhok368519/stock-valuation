# 股票估值计算器 v6.0.0（本地安全版）

PB=PE×ROE 估值验证工具。本版本为**重构版**：无登录墙、无任何云端凭证、用户数据只存本设备。

## 与旧版（5.9.80）的差异

| 项 | 旧版 | v6.0.0 |
|----|------|--------|
| 登录/注册 | 手机号+密码，用户库公开在仓库 | **已移除**，打开即用 |
| GitHub token | XOR 混淆硬编码在页面里 | **已移除**，全站零凭证 |
| favorites.json 自动提交 | 每次收藏变化 PUT 到仓库 | **已移除**；收藏存本设备 IndexedDB，可导出/导入 JSON |
| customers.json | 公开存放用户手机号 | **不再需要/不包含** |
| 开发者后门 | 开发者密码硬编码 | **已移除**；数据工具改为本地工具（抓取/导入/导出） |
| 数据库更新探测 | 每次启动全量下载 6.85MB | 先探测 2KB 的 `db_meta.json`，仅版本变化才下载全量 |
| CDN 兜底 | GitHub API 匿名（60次/h） | jsDelivr CDN 优先，GitHub API 兜底 |
| 北交所 | 市场路由错误 | secid 映射支持 43/83/87/88/920 |
| 版本更新 | 可能反复 reload | 每会话同版本只应用一次 |
| 数据时效 | 无从知晓 | 页面显示"数据日期: YYYY-MM-DD" |

功能完整保留：数据库检索（拼音/简称）、PE×ROE/Graham/DIV 三种估值、计算历史、收藏（本地+分组）、投资笔记、迷你计算器、九个工具页。

## 目录结构

```
index.html            落地页
PB_PE_ROE_calc.html   主应用（数据库/计算器/收藏/笔记）
roe/moat/risk/macro/trend/rotation/schiller/mine/lockup.html  工具页
assets/js/common.js   公共层（错误钩子/诊断日志/safeJSON/网关/收藏导入导出）
assets/css/common.css 公共样式
sw.js                 Service Worker（缓存名=version.json 派生，容量上限，容忍式预缓存）
version.json          ★ 唯一版本真源（APP_VER 与 SW 缓存名都从这里派生）
db_meta.json          ★ 数据库元信息 {v, d(数据日期), c(股票数)} —— 更新数据时必须同步更新
db_data.json          全量财务库（5203 只）
stock_index.json      搜索索引
```

## 发版流程

1. 改代码后：**只改 `version.json` 的 `v`**（如 6.0.0 → 6.0.1），并同步修改各页
   `<script>var APP_VER='...'</script>`（建议后续用构建脚本注入，一处改动）。
2. 数据更新（开发者）：主应用右上角"i" → 数据工具 → 手动抓取（或上传文件）→
   **导出文件** Tab → 导出 db_data.json → 将该文件提交到仓库，同时更新 `db_meta.json`
   （导出后页面会提示；db_meta.json 的 v/d/c 需与导出的 _meta 一致）。
3. 提交到 GitHub 后，用户端会自动探测新版本并清理缓存刷新（同版本号不会反复刷新）。

## 隐私

- 不收集任何个人信息；无账号体系；收藏/笔记/历史仅存于本设备。
- "导出收藏 JSON" 生成的是本地文件，由用户自行保管。
