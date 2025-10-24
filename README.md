# ChromaChat Phone

基于 React + Vite 的手机端拟真 PWA，模拟玻璃拟物风格的 iPhone 界面，提供 AI 角色扮演聊天与可配置的 LLM 接口。

## 功能速览

- 桌面主屏：现实时间、日期、应用图标，支持手机/平板/桌面响应式布局。
- 微信仿真聊天：联系人（角色）列表、角色人设配置、IndexedDB 持久化对话与角色信息、实时调用 LLM 并扮演角色。
- 设置中心：配置 OpenAI 兼容接口（Base URL、API Key、Model）、系统提示词在线编辑、接口连通性测试。
- PWA：可安装到手机主屏，离线缓存基础页面。

## 开发与预览

```bash
npm install
npm run dev -- --host
```

在手机或平板调试时，可通过局域网 IP 访问 `http://<你的IP>:5173`。

### 构建生产包

```bash
npm run build
npm run preview -- --host
```

## 技术栈

- UI：React 18、Tailwind CSS、玻璃拟物设计。
- 状态管理：Zustand + Dexie（IndexedDB 持久化）+ React Query。
- 网络：OpenAI Chat Completion 兼容实现，可自定义系统提示词。
- PWA：自定义 Service Worker、Web App Manifest、图标（SVG）。

## 注意事项

- 需手动在设置中填写合法的 `API Key` 与 `Base URL`（默认使用官方 OpenAI）。
- IndexedDB 数据保存在浏览器本地，可通过浏览器开发者工具管理。
- 若需自定义图标，可替换 `public/icons/icon.svg` 并更新 Manifest。
