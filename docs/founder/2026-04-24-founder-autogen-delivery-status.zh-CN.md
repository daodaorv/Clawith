# Founder Autogen 交付状态（2026-04-24）

## 当前阶段

基于 Clawith 底座的 founder 产品主线，当前已经进入可运行的 MVP 阶段：

- 创业者不需要再从原始单 Agent 创建入口起步，而是先创建一个持久化的 founder workspace。
- 系统已经能跑通 `interview -> draft -> approval -> materialize` 主链路。
- materialize 之后会在现有 Clawith 运行时里生成可直接使用的多 Agent 公司脚手架。
- 创业者最终会落到专属 dashboard，上面同时呈现物化快照和实时 agent 运行状态。

这条交付线对应的主实现规划见：

- `docs/superpowers/plans/2026-04-23-founder-autogen-framework.md`

最新状态刷新：

- 2026-04-30：实现规划文件现在已经纳入仓库跟踪，并补充了执行状态；self-bootstrap live E2E 的自动清理链路也已经在 Docker 后端实际运行环境里验证通过。
- 2026-04-30：新增手动 GitHub Actions live 门禁 `.github/workflows/founder-live-e2e.yml`，用于可从 GitHub runner 访问的 staging 或本地隧道环境，同时不让 push / pull request CI 变脆。
- 2026-04-30：founder 场景选择器现在可以识别 SaaS / 运营自动化类 brief，并生成独立的 `cn-saas-ops-automation` 公司骨架，不再总是落回最初的内容 / 知识付费场景。
- 2026-04-30：Founder Workspace 的草案评审现在会展示场景命中说明、命中依据、优先能力标签、模板预览和能力包预览，让没有工程经验的创业者也能理解为什么生成这套多 Agent 公司骨架。
- 2026-04-30：场景选择器现在也可以识别本地服务获客类 brief，并生成 `cn-local-service-leadgen` 骨架，覆盖预约转化、客户跟进和交付排期。

相关 founder 文档：

- `docs/founder/founder-onboarding.zh-CN.md`

## 已交付内容

### 后端

- `backend/app/models/founder_workspace.py`
  - 在单 Agent 创建之上增加持久化 founder workspace 壳层
- `backend/app/api/founder_workspaces.py`
  - 提供 founder workspace 创建、规划和物化 API
- `backend/app/services/founder_company_materializer.py`
  - 将审批后的 founder 方案转换为真实公司包
- `backend/app/services/founder_company_wiring.py`
  - 将生成角色映射到 Clawith 模板化 agents、skills、relationships、permissions 和 starter triggers
- `backend/app/services/founder_mainline_service.py`
  - 根据 business brief 和结构化答案，在原始内容/出海分发场景与 SaaS/运营自动化场景之间选择不同公司骨架

关键后端提交：

- `de5d5e45` `Make founder-generated companies usable inside the Clawith runtime`

### 前端

- `frontend/src/pages/FounderWorkspace.tsx`
  - founder 专属工作流入口页
  - 草案评审阶段会展示场景命中说明、命中依据、优先能力标签、模板预览和能力包预览，再进入物化确认
- `frontend/src/pages/FounderCompanyDashboard.tsx`
  - materialize 后的 founder 控制台
- `frontend/src/services/founderCompanyDashboard.ts`
  - dashboard 汇总与 blocker 推导
- `frontend/src/services/founderWorkspace.ts`
  - founder workspace API 客户端
- `frontend/src/services/founderMainlineE2e.ts`
  - founder 主链路浏览器回归的共享配置与场景构造器
- `frontend/tests/e2e/founderMainlineE2e.mjs`
  - founder 主链路的自举式真实浏览器 E2E runner

关键前端提交：

- `89fd4d3e` `Ground founder dashboards in live runtime state and blocker signals`

## 自动化验证

2026-04-24 已完成验证：

- `python -m pytest backend/tests -q`
  - 通过：`85 passed`
- `python -m ruff check backend/app/services/founder_company_materializer.py backend/app/services/founder_company_wiring.py backend/tests/test_founder_company_materializer.py backend/tests/test_founder_company_wiring.py`
  - 通过
- `node --test frontend/tests/*.mjs`
  - 通过：`19/19`
- `node --test frontend/tests/founderCompanyDashboard.test.mjs frontend/tests/founderMainlineE2eRuntime.test.mjs`
  - 通过
- `cd frontend && npm run build`
  - 通过

Founder 现在还新增了一条确定性的 release-readiness 入口，会串起 founder 范围内的后端校验、前端测试和前端生产构建：

```bash
cd backend
python -m app.scripts.founder_release_readiness
```

同一条命令已经接入：

- `.github/workflows/founder-release-readiness.yml`

Founder 浏览器自动化现已纳入仓库，默认可通过自举路径直接运行：

```bash
cd frontend
npm run test:e2e:founder
```

该浏览器 runner 的特点：

- 按需把 `playwright-core@1.59.1` 安装到临时 runtime 目录，不新增仓库依赖。
- 直接调用本机 Microsoft Edge，并把截图输出到 `output/playwright/`。
- 如果没有显式提供 `FOUNDER_E2E_*` 凭据，它会自动注册一次性 founder 账号、创建一次性公司、在需要时为该 tenant 注入一个验证用 dummy model，然后继续跑完整 founder 主链路。
- 这条 self-bootstrap 默认路径现在还会在断言完成后自动删除一次性账号、公司、workspace、agents 和 dummy model，避免本地数据库持续堆积脏数据。
- 如果显式提供 `FOUNDER_E2E_EMAIL/FOUNDER_E2E_PASSWORD`，它会复用一个已经准备好模型的 founder tenant，并继续覆盖 `登录 -> 多租户选择（如需要） -> 创建 founder workspace -> 访谈 -> draft -> 确认 -> materialize -> founder dashboard 断言`。
- 只有在你确实想保留这批自举产物用于排查时，才需要设置 `FOUNDER_E2E_SKIP_CLEANUP=1`。

## 真实 UI / API 主链路验证

Founder happy path 已于 2026-04-24 通过真实 UI / API 跑通，并完成了自动化浏览器回归。

环境：

- 最新源码前端：`http://127.0.0.1:3010`
- 后端/API 通过稳定 Docker Web 入口代理：`http://127.0.0.1:3008`

实际跑通流程：

1. 注册或登录
2. 在需要多租户登录时选择正确租户
3. 创建公司
4. 创建 founder workspace
5. 选择已配置模型
6. 填写 8 个访谈问题
7. 保存访谈进度
8. 生成 draft plan
9. 确认可开始物化
10. materialize 公司
11. 跳转到 founder dashboard

观测到的 API 证据：

- `POST /api/tenants/self-create` -> `201`
- `POST /api/founder-workspaces` -> `201`
- `POST /api/founder-workspaces/{id}/planning/interview-progress` -> `200`
- `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- 确认后第二次 `POST /api/founder-workspaces/{id}/planning/draft-plan` -> `200`
- `POST /api/founder-workspaces/{id}/materialize` -> `200`

自动化运行得到的最终结果：

- workspace 名称：`Founder Workspace 13-10-15`
- 最终路由：`/founder-workspace/dashboard`
- dashboard 标题：`Founder Workspace 13-10-15 currently has 4 active agents`
- 展示的 agents 数量：`4`
- blockers：`0`
- relationships：`3`
- starter triggers：`4`

Dashboard 上确认出现的 4 个 agent：

- `Founder Copilot`
- `Project Chief of Staff`
- `Content Strategy Lead`
- `Global Distribution Lead`

2026-04-30 最新 release-readiness 刷新：

- `cd backend && python -m app.scripts.founder_release_readiness --include-live-e2e`
  - backend founder ruff：通过
  - backend founder pytest：`35 passed`
  - frontend founder node tests：`9 pass`
  - frontend production build：通过
  - live founder E2E：以 `self_bootstrap` 模式通过
- 最新 live E2E 结果：
  - workspace 名称：`Founder Workspace 23-36-57`
  - 最终路由：`/founder-workspace/dashboard?workspaceId=e3bf151a-8054-4d95-9520-b6fb2d8b0b34`
  - dashboard 标题：`Founder Workspace 23-36-57 currently has 4 active agents`
  - 展示 agents：`Founder Copilot`、`Project Chief of Staff`、`Content Strategy Lead`、`Global Distribution Lead`
  - blockers：`0`
  - relationships：`3`
  - starter triggers：`4`
- 本次运行的自动清理证据：
  - 删除 agents：`4`
  - 删除 founder workspaces：`1`
  - 删除 dummy models：`1`
  - 删除 users：`1`
  - 删除 identities：`1`
  - 删除 tenants：`1`
  - errors：`[]`
- 后续补扫：
  - `docker exec clawith-backend-1 python3 -m app.scripts.cleanup_founder_self_bootstrap`
  - 结果：`No founder self-bootstrap E2E artifacts were found.`

手动 GitHub Actions live 门禁：

- Workflow：`.github/workflows/founder-live-e2e.yml`
- 触发方式：仅 `workflow_dispatch`
- 必填输入：`base_url`，必须能被 GitHub runner 访问
- 可选 secrets：
  - `FOUNDER_E2E_EMAIL`
  - `FOUNDER_E2E_PASSWORD`
  - `FOUNDER_E2E_TENANT`
  - `FOUNDER_E2E_MODEL_LABEL`
- 如果不提供凭据，workflow 会走 self-bootstrap 路径；除非手动勾选 `skip_cleanup`，否则默认会清理自举产物。
- 截图会作为 `founder-live-e2e-screenshots` artifact 上传。

当前场景覆盖：

- `cn-team-global-content-knowledge`：原始中文内容、海外分发、知识付费业务骨架。
- `cn-saas-ops-automation`：SaaS / 运营自动化业务骨架，面向订阅产品、CRM/表格工作流替代、onboarding、客户成功和周期性报告。
- `cn-local-service-leadgen`：本地服务获客业务骨架，面向同城线索、预约转化、客户跟进和交付排期。

截图产物：

- `output/playwright/2026-04-24T13-10-15-461Z-*.png`
- `output/playwright/founder-natural-dashboard.png`
- `output/playwright/founder-natural-dashboard-full.png`
- `output/playwright/founder-dashboard-final.png`
- `output/playwright/founder-dashboard-full.png`

## 当前已知说明

- 现在 dashboard 会把 `idle` 也计入 active，这是当前实现的预期，因此 headline 显示 4 个 active agents 是正常结果。
- 本地测试租户里仍保留了更早期手工注入的旧 agent 数据；当前 dashboard 之所以没有混淆，是因为它按 snapshot 中存储的 `agent.id` 去 hydrate 实时状态，而不是只按名称匹配。
- Founder 的确定性 release-readiness 链路已经接入 CI，但 live E2E 仍依赖真实前后端环境和本机 Microsoft Edge。新的 self-bootstrap 路径已经去掉了“预置多租户测试账号”这条前置条件，不过这条浏览器门禁仍然依赖真实运行环境。

## 建议的下一步

- 在触碰 founder onboarding、workspace 选择、materialization 或 dashboard 行为的发布前，用手动 `Founder Live E2E (Manual)` workflow 跑一次可访问的 staging 或 tunnel URL。
- 可以先用 `cd backend && python -m app.scripts.reset_founder_demo_tenant --tenant-slug <slug>` 做 dry-run，确认范围后再追加 `--wipe-tenant-agents --yes`，用来重置专用 founder demo tenant。
- 如果某次中断或修复前的 self-bootstrap 运行留下了一次性 founder E2E 脏数据，可以执行 `cd backend && python -m app.scripts.cleanup_founder_self_bootstrap --yes` 做补扫。
- 在 SaaS/运营自动化之后继续补下一类 founder 场景，例如本地服务获客或跨境电商运营。
- 等 UI 文案稳定后，可以继续给 founder onboarding 指南补带注释的截图版本。
