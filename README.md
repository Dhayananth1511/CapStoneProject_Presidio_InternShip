# Travel Planner AI Agent - Capstone Project Documentation

This repository contains the architecture, workflow designs, and system integration details for the Travel Planner AI Client/Server application. The project serves as a comprehensive capstone integrating the architectural principles and technologies studied from **Week 1 through Week 5**.

---

## MAP: Applied Curriculum Topics
* **Week 1 (Foundations & DSA)**: MongoDB Indexing configuration (`userId`, `tripId`, `status`), schema validations, and Git Branching strategies.
* **Week 2 (Backend)**: Express.js REST application styled as **MVC structure with Planner Services**, global rates throttling, Morgan logs, JWT validation, and RBAC auth.
* **Week 3 (Frontend)**: React Single Page Application utilizing Vite, Zustand state, **React Hook Form + Zod input verification**, caching via **TanStack Query**, and **Chart.js** data visualizations.
* **Week 4 (DevOps)**: GitHub Actions test loops, Docker container packaging, and infra automation using **Terraform on AWS (EC2 / S3 / CloudFront / Security Groups)**.
* **Week 5 (Agentic AI)**: Multi-agent coordination (Destination, Transport, and Itinerary agents) run by an orchestrating **Coordinator Agent** using **Groq LLM API**, featuring LangChain Tool integrations, deterministic calculations, and session state memory.

---

## 1. Traveler Workflow

Traces the execution path starting from client-side Zod form validation, JWT validation, service orchestration, external API tool calling, and human-in-the-loop validation, down to MongoDB persistence.

```mermaid
graph TD
    %% Styling and config
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef startEnd fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef process fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef agent fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    classDef api fill:#f5c2e7,stroke:#f5c2e7,stroke-width:2px,color:#11111b;
    
    Traveler([Traveler]):::startEnd --> ClientInput["Dashboard Input Form<br/>(Client Validation: Hook Form + Zod)"]:::process
    ClientInput --> Auth["User Registration / Login<br/>JWT/RBAC Auth Middleware"]:::process
    Auth --> FetchData["Fetch User Dashboard Data<br/>(TanStack Query caching, API Pagination & Filters)"]:::process
    
    FetchData --> Create["Create New Trip Request"]:::process
    FetchData --> View["View Existing Trips / Delete Trip"]:::process
    
    Create --> InputGoal["User enters Goal Input<br/>e.g., 'Plan a 5-day trip to Manali for 2 people within ₹30,000'"]:::process
    View --> InputGoal
    
    InputGoal --> ExpressRouter["Express.js Server Router<br/>Rate-limiting via express-rate-limit<br/>Morgan/Winston Session Logging"]:::process
    
    ExpressRouter --> PlannerService["Planner Service Layer<br/>(Separates controller from AI orchestration)"]:::process
    PlannerService --> FetchMem["Load Turn History from Conversation Memory"]:::process
    
    FetchMem --> Orchestrator["Coordinator Agent<br/>(LangChain Executor with Memory context)"]:::agent
    Orchestrator --> ParseIntent["Understand User Intent & Requirements"]:::process
    ParseIntent --> SplitTasks["Break Input into Sub-Tasks"]:::process
    
    SplitTasks --> DestAgent["Destination Agent<br/>Select ideal location options"]:::agent
    SplitTasks --> TransAgent["Transport Agent<br/>Plan transit connections"]:::agent
    SplitTasks --> AccomAgent["Accommodation Agent<br/>Search hotels & homestays"]:::agent
    
    DestAgent --> BudgetJS["Deterministic JS Budget Function<br/>(Math calculation & limit validation)"]:::process
    TransAgent --> BudgetJS
    AccomAgent --> BudgetJS
    
    BudgetJS --> ItinAgent["Itinerary Agent<br/>Assemble scheduling sequence"]:::agent
    
    ItinAgent --> Coordinator["Coordinator Agent<br/>Reconsolidates Context"]:::agent
    
    Coordinator --> ToolCall["Execute Agent Tools<br/>Weather & Maps API calls"]:::api
    
    ToolCall --> GenPlan["Generate Final Travel Plan via Groq API (Free)<br/>(Async/Await processing)"]:::process
    GenPlan --> HITL{"Human-in-the-Loop Confirmation<br/>'Do you approve this travel plan?'"}:::process
    
    HITL -->|Approve| SaveDB["Save Trip to MongoDB Atlas<br/>(Mongoose write validations)"]:::process
    HITL -->|Reject| ModifyReq["Modify Requirements & Send Back"]:::process
    
    SaveDB --> ScheduleRem["Schedule Reminders (Calendar Tool Integration)"]:::process
    ModifyReq --> Orchestrator
    
    ScheduleRem --> UpdateStatus["Update Trip Status<br/>(Draft ➔ Planned ➔ Confirmed)"]:::process
    UpdateStatus --> DashboardUpdate([User Dashboard UI Updated]):::startEnd
```

---

## 2. Admin Workflow

Details admin authorization, role validation middleware, navigation to administrative management sections, and metrics visualization dashboards. Admin features fetch directly from database indexes without hitting AI.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef startEnd fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef process fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef admin fill:#f38ba8,stroke:#f38ba8,stroke-width:2px,color:#11111b;

    Admin["Admin Web Dashboard"]:::admin --> Auth["JWT Decode: Verify User Admin Role<br/>(RBAC Role Verification Middleware)"]:::process
    Auth --> DashboardREST["Admin Panel Router<br/>(Rate-limited REST endpoints)"]:::process
    
    DashboardREST --> Users["View All Users<br/>(Includes Email/Status Pagination & Filters)"]:::process
    DashboardREST --> Trips["View All Trips<br/>(Status queries: Draft/Planned/Confirmed)"]:::process
    DashboardREST --> Analytics["System Metrics Dashboard<br/>(Chart.js Data Binding)"]:::process
    
    Users --> AuditLogs["Audit Access logs & User status edit"]:::process
    Trips --> SearchTrips["Query database indexes on MongoDB"]:::process
    Analytics --> Stats["Display Active Users, Popular Locations,<br/>and Total Trip costs metrics"]:::process
```

---

## 3. AI Agent Internal Flow

Highlights sequential planning execution and conditional routing (handling ambiguity, budget checks, confidence failures, tool calling, and human validation) to complete traveler goals.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef startEnd fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef process fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef agent fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    classDef tool fill:#f5c2e7,stroke:#f5c2e7,stroke-width:2px,color:#11111b;
    classDef error fill:#f38ba8,stroke:#f38ba8,stroke-width:2px,color:#11111b;

    Goal([User Natural Language Goal]):::startEnd --> Controller["Trip Controller"]:::process
    Controller --> PlannerService["Planner Service<br/>(Service layer orchestrator)"]:::process
    
    %% Turn State Memory
    PlannerService --> FetchMem["Load Turn History from Conversation Memory"]:::process
    
    FetchMem --> Coord["Coordinator Agent<br/>(LangChain Agent Orchestrator)"]:::agent
    Coord --> Parse["Decompose Goal & Parse Intent"]:::process
    
    %% Edge Case: Ambiguous Goals
    Parse --> CheckAmb{"Are destination<br/>or dates ambiguous?"}:::process
    CheckAmb -->|Yes| Clarify["Ask Clarifying Question<br/>(Require Traveler Input)"]:::process
    Clarify --> Goal
    
    %% Sequential Execution
    CheckAmb -->|No| DestAgent["1. Destination Agent<br/>(Select destination options)"]:::agent
    DestAgent --> TransAgent["2. Transport Agent<br/>(Plan planes / trains / buses transit)"]:::agent
    TransAgent --> AccomAgent["3. Accommodation Agent<br/>(Hotels & homestays recommendations)"]:::agent
    
    %% Deterministic JavaScript Budget instead of AI
    AccomAgent --> BudgetJS["4. Deterministic JS function<br/>(Calculate accurate total cost)"]:::process
    
    %% Edge Case: Insufficient Budget
    BudgetJS --> CheckBudget{"Is budget sufficient<br/>for destination?"}:::process
    CheckBudget -->|No| AltProp["Suggest alternatives & details<br/>(Insufficient budget flow)"]:::error
    AltProp --> Goal
    
    CheckBudget -->|Yes| ItinAgent["5. Itinerary Agent<br/>(Assemble daily scheduling)"]:::agent
    
    %% Tool Calling
    ItinAgent --> Tools["LangChain Tool executor"]:::tool
    subgraph LangchainTools ["Integration Tools"]
        WeatherTool["Weather Tool (OpenMeteo API)"]:::tool
        MapsTool["Maps Tool (Google Maps API)"]:::tool
        CalendarTool["Calendar Tool (Google Calendar API)"]:::tool
    end
    Tools --> WeatherTool
    Tools --> MapsTool
    Tools --> CalendarTool
    
    %% Edge Case: Plan Confidence 
    WeatherTool --> ConfidenceCheck{"Can generate plan<br/>confidently?"}:::process
    MapsTool --> ConfidenceCheck
    CalendarTool --> ConfidenceCheck
    
    ConfidenceCheck -->|No| ErrorHandle["Graceful error response<br/>(Zero hallucinations)"]:::error
    ErrorHandle --> EndGrace([Graceful Terminate]):::startEnd
    
    ConfidenceCheck -->|Yes| CoordCompile["Coordinator Agent<br/>(Consolidate sequential outputs)"]:::agent
    
    CoordCompile --> PromptGroq["Generate Final Document via Groq LLM"]:::process
    PromptGroq --> SaveMem["Save updated memory state to MongoDB"]:::process
    
    SaveMem --> Review["Traveler reviews full itinerary<br/>& budget breakdown"]:::process
    
    %% Human in the Loop (Crucial Constraint)
    Review --> Approve{"Traveler approves?"}:::process
    Approve -->|Yes| Save["Save Trip into MongoDB Atlas<br/>(Status: Draft / Planned / Confirmed)"]:::process
    Approve -->|No| Modify["Modify Requirements & send back<br/>(Maintains Memory State)"]:::process
    
    Modify --> Goal
    Save --> EndApp([End Workflow]):::startEnd
```

---

## 4. Project Development Workflow

Illustrates the Git workflow, Continuous Integration pipeline via GitHub Actions, Docker builds, Terraform IaC provisioning, and deployment endpoints on AWS.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef local fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef ci fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef cd fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    
    subgraph Local ["Local Development"]
        Branch["Create Feature Branch<br/>(Git Flow strategy)"]:::local
        Dev["Develop Features (Node.js/React/Express)"]:::local
        Commit["Checkin Changes (Commit message conventions)"]:::local
        Push["Push branch to GitHub Repository"]:::local
        
        Branch --> Dev --> Commit --> Push
    end
    
    subgraph CI ["GitHub Actions CI Pipeline"]
        PR["Open Pull Request to Main"]:::ci
        GA["GitHub Actions Triggered"]:::ci
        LintFormatter["Code Linting & Formatting Check"]:::ci
        Tests["Run Unit Tests (Vitest / Jest)"]:::ci
        SecurityScan["Security scan & npm audit"]:::ci
        Build["Build Production Build (Vite & ESBuild)"]:::ci
        Docker["Docker Image Build & Scan"]:::ci
        Merge["PR Review & Merge to Main"]:::ci
        
        PR --> GA --> LintFormatter --> Tests --> SecurityScan --> Build --> Docker --> Merge
    end
    
    subgraph CD ["AWS CD Pipeline & IaC Provisioning"]
        TriggerCD["CD Action Triggered"]:::cd
        SecretsRetrieve["Retrieve secrets from AWS Secrets Manager"]:::cd
        Terraform["Terraform Apply<br/>(Provision AWS VPC, EC2, S3, CloudFront)"]:::cd
        
        DepBack["Deploy Backend (Docker container on AWS EC2)"]:::cd
        DepFront["Deploy Frontend (AWS S3 + CloudFront CDN CDN invalidation)"]:::cd
        DB["MongoDB Atlas Index verification"]:::cd
        CloudWatch["Configure Prometheus/Grafana or CloudWatch Metrics"]:::cd
        Prod(["Production Live State"]):::cd
        
        TriggerCD --> SecretsRetrieve --> Terraform
        Terraform --> DepBack
        Terraform --> DepFront
        Terraform --> DB
        
        DepBack --> CloudWatch
        DepFront --> CloudWatch
        CloudWatch --> Prod
    end

    Push --> PR
    Merge --> TriggerCD
```

---

## 5. Complete System Architecture

Maps out the structural tier boundaries: Frontend Web Client, Service Layer context, AI Agent orchestration cluster, External Integrations, and persistent database layers.

```mermaid
graph TD
    %% Styling
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef frontend fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef backend fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef db fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    classDef ext fill:#f5c2e7,stroke:#f5c2e7,stroke-width:2px,color:#11111b;

    %% Frontend Tier
    subgraph ClientTier ["Frontend Client (React TS - Week 3)"]
        FE["React User Interface<br/>(Tailwind CSS)"]:::frontend
        Val["Form Validation<br/>(React Hook Form + Zod)"]:::frontend
        State["State Manager<br/>(Zustand / Context API)"]:::frontend
        Queries["API Client<br/>(TanStack Query / Axios)"]:::frontend
        ChartsFE["Visualizations<br/>(Chart.js Analytics)"]:::frontend
        AuthFE["JWT Secure Storage<br/>(Cookies/LocalStorage)"]:::frontend
    end

    %% Backend Server Tier
    subgraph ServerTier ["Backend Server (Node.js/Express MVC + Service - Week 2)"]
        API["Express.js Server Route Handler"]:::backend
        
        subgraph Middlewares ["Express.js Middleware Chain"]
            Throttle["API Rate Limiter"]:::backend
            Log["Morgan Logger"]:::backend
            JWT["JWT Validation & Authorization"]:::backend
            RBAC["RBAC Role Validator"]:::backend
            ErrorM["Global Error Handler"]:::backend
        end
        
        API --> Throttle --> Log --> JWT --> RBAC
        
        PlannerService["Planner Service<br/>(Core Business Logic Handler)"]:::backend
        RBAC --> PlannerService
        
        BudgetJS["Deterministic Budget Calculator<br/>(Deterministic JS functions)"]:::backend
        PlannerService --> BudgetJS
        
        AIPlanner["AI Agent Orchestrator (LangChain JS)"]:::backend
        PlannerService --> AIPlanner
        
        %% Sub-agents cluster
        subgraph agents ["AI Agent Cluster (Agentic AI - Week 5)"]
            DestAgent["Destination Agent"]:::backend
            TransAgent["Transport Agent"]:::backend
            ItinAgent["Itinerary Agent"]:::backend
        end
        
        AIPlanner --> DestAgent
        AIPlanner --> TransAgent
        AIPlanner --> ItinAgent
        
        DestAgent --> Coord["Coordinator Agent"]:::backend
        TransAgent --> Coord
        ItinAgent --> Coord
    end

    %% Storage Tier
    subgraph DBTier ["Database & Storage (Week 1 / 2)"]
        DB[("MongoDB Atlas Database<br/>(Indexed Collections & Users)")]:::db
        MemStore[("MongoDB Conversation MemoryStore<br/>(Turn history state storage)")]:::db
    end

    %% External Tier
    subgraph ExtTier ["External Services & Infrastructure (Week 4)"]
        LLM["Groq LLM API (Free)"]:::ext
        
        subgraph LCTools ["LangChain Tools"]
            WeatherTool["Weather Tool (OpenMeteo API)"]:::ext
            MapsTool["Maps Tool (Google Maps API)"]:::ext
            CalendarTool["Calendar Tool (Google Calendar API)"]:::ext
        end
        
        AWSSecrets["AWS Secrets Manager / KMS"]:::ext
        CloudWatch["Amazon CloudWatch Logging"]:::ext
    end

    %% Connect UI controls
    FE --> Val --> Queries
    Queries --> AuthFE
    ChartsFE --> FE

    %% Core Data flow
    Queries -->|JSON REST Requests| API
    PlannerService -->|Search & Update History| MemStore
    Coord -->|Inference Query| LLM
    LLM -->|Invokes Tools| LCTools
    Coord -->|Store Completed Trip Profile| DB
    PlannerService -->|Read Secrets| AWSSecrets
    API -.->|Metrics & Diagnostics| CloudWatch
    
    %% Direct Database fetch for Admin Dashboard (No AI)
    API -->|Query metrics and trips| DB
    
    DB -->|Return Results| API
    API -->|Send JSON Payload Response| Queries
```
