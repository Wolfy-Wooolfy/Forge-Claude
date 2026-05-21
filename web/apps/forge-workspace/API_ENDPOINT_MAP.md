# API Endpoint Map — forge-workspace

> Generated: Stage 13.1  
> Total endpoints: 24  
> Source: `src/api/`

| # | Path | Method | Client Function | Consumed By |
|---|------|--------|-----------------|-------------|
| 1 | `/api/auth/register` | POST | `register` | Auth / onboarding flow |
| 2 | `/api/auth/login` | POST | `login` | Auth / onboarding flow |
| 3 | `/api/projects` | GET | `listProjects` | ProjectsView |
| 4 | `/api/projects/activate` | POST | `activateProject` | ProjectsView |
| 5 | `/api/projects/create` | POST | `createProject` | ProjectsView |
| 6 | `/api/projects/delete` | POST | `deleteProject` | ProjectsView |
| 7 | `/api/ai-os/chat/stream` | POST (SSE) | `chatStream` | ChatView |
| 8 | `/api/ai-os/clarification/answer` | POST | `answerClarification` | ChatView |
| 9 | `/api/ai-os/intake` | POST | `intake` | ChatView |
| 10 | `/api/ai/analyze` | POST | `analyzeRequest` | ChatView |
| 11 | `/api/ai/preview` | POST | `previewDraft` | ChatView |
| 12 | `/api/ai/approval-policy` | GET | `getApprovalPolicy` | ChatView |
| 13 | `/api/ai/history` | GET | `getHistory` | ChatView / KBView |
| 14 | `/api/ai/propose` | POST | `proposeDraft` | ChatView |
| 15 | `/api/ai/read-file` | POST | `readFile` | ChatView |
| 16 | `/api/ai/decision` | POST | `createDecision` | ChatView |
| 17 | `/api/ai/clarify` | POST | `clarifyRequest` | ChatView |
| 18 | `/api/ai/options` | POST | `getOptions` | ChatView |
| 19 | `/api/ai/select-strategy` | POST | `selectStrategy` | ChatView |
| 20 | `/api/ai/confirm-strategy` | POST | `confirmStrategy` | ChatView |
| 21 | `/api/governance/tool-integration-readiness` | POST | `checkToolIntegrationReadiness` | DoctorView |
| 22 | `/api/governance/boundary-audit/all` | POST | `runBoundaryAudit` | DoctorView |
| 23 | `/api/governance/decision-artifact-validator` | POST | `validateDecisionArtifacts` | DoctorView |
| 24 | `/api/governance/fork/report` | POST | `getForkReport` | DoctorView |
