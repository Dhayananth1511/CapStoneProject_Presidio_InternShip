# Travel Planner AI Agent - Capstone Project Documentation

This repository contains the architecture, workflow designs, and system integration details for the Travel Planner AI Client/Server application. The project serves as a comprehensive capstone integrating the architectural principles and technologies studied from **Week 1 through Week 5**.

---

## 1. Traveler Workflow

Traces the execution path starting from client-side Zod form validation, JWT validation, service orchestration, standardized MCP tool calling protocols, and human-in-the-loop validation, down to MongoDB persistence.

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
    
    Create --> InputGoal["User enters Goal Input (includes Destination)<br/>e.g., 'Plan a 5-day trip to Manali for 2 people within ₹30,000'"]:::process
    View --> InputGoal
    
    InputGoal --> ExpressRouter["Express.js Server Router<br/>Rate-limiting via express-rate-limit<br/>Morgan/Winston Session Logging"]:::process
    
    ExpressRouter --> PlannerService["Planner Service Layer<br/>(Separates controller from AI orchestration)"]:::process
    PlannerService --> FetchMem["Load Turn History from Conversation Memory"]:::process
    
    FetchMem --> Orchestrator["Coordinator Agent<br/>(MCP Client Agent utilizing Memory context)"]:::agent
    Orchestrator --> ParseIntent["Understand User Intent & Input Requirements"]:::process
    ParseIntent --> SplitTasks["Break Input into Sub-Tasks"]:::process
    
    SplitTasks --> TransAgent["Transport Agent<br/>Plan transit connections to destination"]:::agent
    SplitTasks --> AccomAgent["Accommodation Agent<br/>Search hotels & homestays"]:::agent
    
    TransAgent --> BudgetAgent["Budget Agent<br/>(Estimate costs & breakdown)"]:::agent
    AccomAgent --> BudgetAgent
    
    BudgetAgent --> ItinAgent["Itinerary Agent<br/>Assemble scheduling sequence"]:::agent
    
    ItinAgent --> Coordinator["Coordinator Agent<br/>(Aggregates agent data)"]:::agent
    
    Coordinator --> ToolCall["MCP Client Tool Request<br/>(Launches standardized MCP protocol requests)"]:::api
    
    ToolCall --> GenPlan["Generate Final Travel Plan via Groq API (Free)<br/>(Async/Await processing)"]:::process
    GenPlan --> HITL{"Human-in-the-Loop Confirmation<br/>'Do you approve this travel plan?'"}:::process
    
    HITL -->|Approve| SaveDB["Save Trip to MongoDB Atlas<br/>(Mongoose write validations)"]:::process
    HITL -->|Reject| ModifyReq["Modify Requirements & Send Back"]:::process
    
    SaveDB --> ScheduleRem["Schedule Reminders (Calendar MCP Server Tool)"]:::process
    ModifyReq --> Orchestrator
    
    ScheduleRem --> UpdateStatus["Update Trip Status<br/>(Draft ➔ Planned ➔ Confirmed)"]:::process
    UpdateStatus --> DashboardUpdate([User Dashboard UI Updated]):::startEnd
```

---

## 2. Admin Workflow

Details admin authorization, role validation middleware, navigation to administrative management sections, and metrics visualization dashboards. Admin features fetch directly from database indexes without hitting AI interface layers.

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

Highlights sequential planning execution and conditional routing (handling ambiguity, budget checks, confidence failures, MCP tool calling, and human validation) to complete traveler goals.

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
    
    FetchMem --> Coord["Coordinator Agent<br/>(MCP Client Agent)"]:::agent
    Coord --> Parse["Decompose Goal & Parse Intent"]:::process
    
    %% Edge Case: Ambiguous Goals
    Parse --> CheckAmb{"Are destination<br/>or dates ambiguous?"}:::process
    CheckAmb -->|Yes| Clarify["Ask Clarifying Question<br/>(Require Traveler Input)"]:::process
    Clarify --> Goal
    
    %% Sequential Execution of Sub-Agents
    CheckAmb -->|No| TransAgent["1. Transport Agent<br/>(Plan planes / trains / buses transit)"]:::agent
    TransAgent --> AccomAgent["2. Accommodation Agent<br/>(Hotels & homestays recommendations)"]:::agent
    
    %% Budget Agent
    AccomAgent --> BudgetAgent["3. Budget Agent<br/>(Estimate and verify expenses)"]:::agent
    
    %% Edge Case: Insufficient Budget
    BudgetAgent --> CheckBudget{"Is budget sufficient<br/>for destination?"}:::process
    CheckBudget -->|No| AltProp["Suggest cheaper stay/transport alternatives<br/>(Insufficient budget flow)"]:::error
    AltProp --> Goal
    
    CheckBudget -->|Yes| ItinAgent["4. Itinerary Agent<br/>(Assemble daily scheduling)"]:::agent
    
    %% Tool Calling
    ItinAgent --> Tools["Orchestrate tool requests via Model Context Protocol"]:::tool
    subgraph MCPRegistries ["MCP Server Registry Tools"]
        WeatherTool["Weather MCP Server (OpenMeteo Protocol)"]:::tool
        MapsTool["Maps MCP Server (Google Maps Protocol)"]:::tool
        CalendarTool["Calendar MCP Server (Google Calendar Protocol)"]:::tool
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

Maps out the structural tier boundaries: Frontend Web Client, Service Layer context, AI Agent orchestration cluster, External MCP Integrations, and persistent database layers.

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
        
        AIPlanner["AI Agent Orchestrator (LangChain / MCP Client)"]:::backend
        PlannerService --> AIPlanner
        
        %% Sub-agents cluster
        subgraph agents ["AI Agent Cluster (Agentic AI - Week 5)"]
            TransAgent["Transport Agent"]:::backend
            AccomAgent["Accommodation Agent"]:::backend
            BudAgent["Budget Agent"]:::backend
            ItinAgent["Itinerary Agent"]:::backend
        end
        
        AIPlanner --> TransAgent
        AIPlanner --> AccomAgent
        AIPlanner --> BudAgent
        AIPlanner --> ItinAgent
        
        TransAgent --> Coord["Coordinator Agent"]:::backend
        AccomAgent --> Coord
        BudAgent --> Coord
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
        
        subgraph LCTools ["Standardized MCP Servers"]
            WeatherTool["Weather MCP Server (OpenMeteo Protocol)"]:::ext
            MapsTool["Maps MCP Server (Google Maps Protocol)"]:::ext
            CalendarTool["Calendar MCP Server (Google Calendar Protocol)"]:::ext
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
    LLM -->|Standardized MCP Requests| LCTools
    Coord -->|Store Completed Trip Profile| DB
    PlannerService -->|Read Secrets| AWSSecrets
    API -.->|Metrics & Diagnostics| CloudWatch
    
    %% Direct Database fetch for Admin Dashboard (No AI)
    API -->|Query metrics and trips| DB
    
    DB -->|Return Results| API
    API -->|Send JSON Payload Response| Queries
```
