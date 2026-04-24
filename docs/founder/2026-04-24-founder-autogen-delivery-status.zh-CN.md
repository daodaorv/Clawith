# Founder Autogen 交付状态（2026-04-24）

## 当前阶段

这一轮围绕 Clawith 底座的 Founder 产品线，已经进入“可运行 MVP”阶段：

- 创业者不再从原始单 Agent 创建页起步，而是先创建一个持久化的 founder workspace。
- 系统已经能跑通 `interview -> draft -> approval -> materialize` 主链路。
- materialize 之后会在 Clawith 运行时里生成真实可用的多 Agent 公司脚手架。
- 创业者会落到一个专用 dashboard，上面既有物化快照，也有实时 agent 运行态。

对应的实施规划见：

- `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`

## 已交付内容

后端核心：

- `backend/app/models/founder_workspace.py`
- `backend/app/api/founder_workspaces.py`
- `backend/app/services/founder_company_materializer.py`
- `backend/app/services/founder_company_wiring.py`

前端核心：

- `frontend/src/pages/FounderWorkspace.tsx`
- `frontend/src/pages/FounderCompanyDashboard.tsx`
- `frontend/src/services/founderWorkspace.ts`
- `frontend/src/services/founderCompanyDashboard.ts`

关键提交：

- `de5d5e45` `Make founder-generated companies usable inside the Clawith runtime`
- `89fd4d3e` `Ground founder dashboards in live runtime state and blocker signals`

## 已验证结果

自动化验证：

- `python -m pytest backend/tests -q` 通过，`85 passed`
- `python -m ruff check backend/app/services/founder_company_materializer.py backend/app/services/founder_company_wiring.py backend/tests/test_founder_company_materializer.py backend/tests/test_founder_company_wiring.py` 通过
- `node --test frontend/tests/*.mjs` 通过，`19/19`
- `cd frontend && npm run build` 通过

真实 UI / API 主链路验证：

- 日期：`2026-04-24`
- 前端入口：`http://127.0.0.1:3010`
- 后端代理：`http://127.0.0.1:3008`
- 已真实完成：
  1. 登录/注册
  2. 创建公司
  3. 创建 founder workspace
  4. 选择模型
  5. 填写 8 个访谈问题
  6. 保存访谈
  7. 生成草案
  8. 勾选确认
  9. materialize
  10. 跳转 dashboard

关键 API 证据：

- `POST /api/tenants/self-create` -> `201`
- `POST /api/founder-workspaces` -> `201`
- `POST /api/founder-workspaces/{id}/planning/interview-progress` -> `200`
- `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- 二次 `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- `POST /api/founder-workspaces/{id}/materialize` -> `200`

最终自然跑通的 workspace：

- 名称：`Founder Natural Flow Studio`
- id：`8f7cdea2-724d-4f1b-a83c-b33625089771`
- 最终页面：`/founder-workspace/dashboard`

Dashboard 实际结果：

- 总 Agent 数：`4`
- 活跃 Agent：`4`
- 暂停 Agent：`0`
- 阻塞项：`0`
- 协作关系：`3`
- 启动触发器：`4`

实际显示的 4 个 Agent：

- `Founder Copilot`
- `Project Chief of Staff`
- `Content Strategy Lead`
- `Global Distribution Lead`

截图产物：

- `output/playwright/founder-natural-dashboard.png`
- `output/playwright/founder-natural-dashboard-full.png`
- `output/playwright/founder-dashboard-final.png`
- `output/playwright/founder-dashboard-full.png`

## 当前已知说明

- 现在的 dashboard 逻辑会把 `idle` 计入 active，所以 headline 里显示 4 个 active agents 是当前实现预期。
- 本地测试租户里仍保留早期手工注入的旧测试 agent 数据；当前 dashboard 之所以没有混乱，是因为它按 snapshot 里的 `agent.id` 去 hydrate 实时状态，而不是只按重名匹配。
- Founder 真正的主链路已经手工跑通，但还没有上升为 CI 级浏览器自动化用例。

## 建议的下一步

- 把 `output/founder-e2e-flow.cjs` 升级成稳定的 Founder 主链路自动化 E2E。
- 给本地 founder demo tenant 增加 reset / cleanup 机制，减少手工验收时的脏数据影响。
- 如果要进一步面向零 AI / 零工程用户交付，可以补一份“模型准备要求 + 首次启动说明”的用户文档。
