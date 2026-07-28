# 模块边界与文件组织

更新时间：2026-07-28

本项目按“应用组装、功能模块、共享基础能力”维护。文件拆分不能改变 UI、接口或运行行为。

## 前端目录

```text
web-ui/src/
  App.tsx                 单人页面组装，不实现具体业务
  components/             跨功能纯 UI 与应用外壳
  features/<feature>/     一个功能的组件、状态、接口和类型
    components/
    data/
    hooks/
    model/
    realtime/             需要实时事件时使用
    state/                需要独立状态辅助时使用
  shared/
    api/                  跨功能 HTTP、鉴权等基础设施
    model/                跨功能稳定类型
```

依赖方向：`App -> features -> shared`。`components/` 可以被功能使用，但不能调用功能 API、持有业务状态或依赖某个功能的类型。

## 后端目录

```text
windows/scripts/remote-room-demo.mjs   读取配置、组装依赖、启动服务
windows/server/request-handler.mjs     鉴权和路由分发
windows/server/routes/                 按功能处理 HTTP 请求
windows/server/http/                   HTTP 与访问控制基础能力
windows/server/<feature>/              复杂服务的纯辅助逻辑
windows/server/*-service.mjs            功能服务和运行状态
```

路由文件只解析请求并调用服务；持久化、Codex 协议和业务状态留在服务中。新增接口应进入对应功能路由，不再直接堆入 `request-handler.mjs`。

## 拆分触发规则

- TypeScript/JavaScript 文件接近 200 行时检查是否同时承担多种职责；超过约 250 行应优先拆分。
- 一个 Hook 同时管理列表、详情、实时事件、发送和其他功能时，拆成状态 Hook 与组装 Hook。
- CSS Module 按组件归属，不使用一份页面级 CSS 承担所有子组件样式。
- 公共 HTTP、认证和媒体类型不得放在某个业务功能目录供其他功能反向引用。
- 文件移动必须保持导出、接口、DOM 结构、样式规则和用户文案不变，并通过构建与现有测试。
