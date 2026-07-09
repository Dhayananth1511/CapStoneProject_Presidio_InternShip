# Travel Planner AI Agent

An enterprise-grade, production-ready AI Travel Planner application built on a multi-agent backend, Model Context Protocol (MCP) tool integration, Redis caching, and AWS cloud infrastructure. This application automates search, budgeting, itinerary generation, and bookings through a seamless, context-aware AI planning flow.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Sequence Diagram](#2-sequence-diagram)
3. [AI Agent Architecture](#3-ai-agent-architecture)
4. [Model Context Protocol (MCP) Tool Layer](#4-model-context-protocol-mcp-tool-layer)
5. [Traveler Planning Workflow](#5-traveler-planning-workflow)
6. [API Layer Design](#6-api-layer-design)
7. [Database Schema & ER Diagram](#7-database-schema--er-diagram)
8. [Trip State Machine](#8-trip-state-machine)
9. [Prompt Engineering Layer](#9-prompt-engineering-layer)
10. [JSON Validation & Structured Output Parser](#10-json-validation--structured-output-parser)
11. [Confidence & Fallback Flow](#11-confidence--fallback-flow)
12. [Memory Architecture & Long-Term Update Policy](#12-memory-architecture--long-term-update-policy)
13. [User Profile System & Context Extraction](#13-user-profile-system--context-extraction)
14. [Granular Replanning Logic](#14-granular-replanning-logic)
15. [Complete Budget Model](#15-complete-budget-model)
16. [Booking & Payment Service Layer](#16-booking--payment-service-layer)
17. [Background Notification Queue](#17-background-notification-queue)
18. [Redis Cache Strategy (TTL & Key Design)](#18-redis-cache-strategy-ttl--key-design)
19. [LLM Cost Optimization Strategy](#19-llm-cost-optimization-strategy)
20. [Security & Authentication Architecture](#20-security--auth-architecture)
21. [Folder Structure](#21-folder-structure)
22. [Class Diagram](#22-class-diagram)
23. [CI/CD & Deployment Flow](#23-cicd--deployment-flow)
24. [Rate Limiting Flow](#24-rate-limiting-flow)
25. [Observability & Error Redirection Matrix](#25-observability--error-redirection-matrix)
26. [Technical Stack](#26-technical-stack)

---

## 1. System Architecture

The project is structured with a strict separation of concerns, dividing AI reasoning, tool execution, and core business logic. Rather than wrapping every function in an AI agent, the system uses a single master Planner Agent that handles cognitive tasks and delegates operations to services, database repositories, or MCP tools.

```mermaid
graph TD
    %% Styling and config
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef frontend fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef backend fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef agent fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    classDef tool fill:#f5c2e7,stroke:#f5c2e7,stroke-width:2px,color:#11111b;
    classDef cache fill:#fab387,stroke:#fab387,stroke-width:2px,color:#11111b;
    classDef db fill:#cba6f7,stroke:#cba6f7,stroke-width:2px,color:#11111b;

    User([Traveler Browser]):::frontend --> ReactFE["React Frontend<br/>(Vite + Tailwind)"]:::frontend
    ReactFE -->|HTTP / JSON API| DirectAPI["Express API Gateway"]:::backend

    subgraph ServerTier ["Node/Express Backend Tier"]
        DirectAPI --> Router["Route Controller"]:::backend
        Router --> Middlewares{"Middlewares<br/>(JWT, RBAC, Rate Limit)"}:::backend
        Middlewares -->|Valid Request| PlannerService["Planner Service<br/>(Orchestrator)"]:::backend

        subgraph AI_Cognitive_Layer ["Agent Cognitive Layer"]
            PlannerService --> PlannerAgent["Planner Agent (Master Orchestrator)"]:::agent
            PlannerAgent --> MissingInfoAgent["Missing Info Agent"]:::agent
            PlannerAgent --> DestRecAgent["Destination Rec Agent"]:::agent
            PlannerAgent --> BudgetAgent["Budget Reasoning Agent"]:::agent
            PlannerAgent --> ItinAgent["Itinerary Gen Agent"]:::agent
        end

        subgraph Business_Services ["Service Layer"]
            PlannerService --> BookingService["Booking Service"]:::backend
            BookingService --> PaymentService["Payment Service (Mock)"]:::backend
            BookingService --> NotificationService["Notification Service (Queue)"]:::backend
        end
    end

    subgraph IntegrationTier ["External Tools (MCP Client / Server)"]
        PlannerAgent --> ToolExecutor["Tool Call Executor"]:::backend
        ToolExecutor -->|MCP Protocol| WeatherMCP["Weather Tool<br/>(OpenMeteo API)"]:::tool
        ToolExecutor -->|MCP Protocol| MapsMCP["Maps & Geocoding Tool<br/>(Google Maps API)"]:::tool
        ToolExecutor -->|MCP Protocol| HotelMCP["Hotel Search Tool<br/>(Mock Provider)"]:::tool
        ToolExecutor -->|MCP Protocol| TransMCP["Transit Search Tool<br/>(Mock Provider)"]:::tool
        ToolExecutor -->|MCP Protocol| CalMCP["Calendar Sync Tool<br/>(Google Calendar API)"]:::tool
    end

    subgraph DataTier ["Caching & Databases"]
        PlannerService --> RedisCache[("Redis Cache<br/>(Weather/Routes/Rate-Limits)")]:::cache
        PlannerService --> Mongo[(MongoDB Atlas<br/>Users, Trips, Logs)]:::db
    end

    class Router,Middlewares,PlannerService,BookingService,PaymentService,NotificationService backend;
    class PlannerAgent,MissingInfoAgent,DestRecAgent,BudgetAgent,ItinAgent agent;
    class WeatherMCP,MapsMCP,HotelMCP,TransMCP,CalMCP tool;
    class RedisCache cache;
    class Mongo db;
```

---

## 2. Sequence Diagram

This diagram traces the full lifetime of a planning and booking request, demonstrating how control flows from the User through the controllers, service layers, master agent, tool execution wrappers, and persistence.

```mermaid
sequenceDiagram
    autonumber
    actor User as Traveler (Frontend)
    participant API as Express API/Controller
    participant Serv as Planner Service
    participant Master as Planner Agent (Master)
    participant Redis as Redis Cache
    participant MCP as MCP Tool Executor
    participant DB as MongoDB Atlas

    User->>API: POST /api/trips (Prompt, Travel Intent)
    API->>API: Authentication & Rate Limiting Verification
    API->>Serv: generatePlan(userId, prompt)
    Serv->>DB: Fetch Active Session & User Profile
    DB-->>Serv: User Record & Preferences
    Serv->>Serv: Load Short & Long Term Memory
    Serv->>Master: startPlanningPipeline(Context)
    
    %% Missing Info Check
    Master->>Master: Invoke Missing Info Agent (Validate slots)
    alt Missing Critical Parameters
        Master-->>User: Clarifying questions prompt (E.g. dates, budget)
    else Context Complete
        Master->>Master: Resolve Destination Recommendation (If needed)
        
        %% Tool Execution Loop
        critical Fetch Parallel Context
            Master->>Redis: Check Cache (Weather, Hotel, Transit)
            alt Cache Hit
                Redis-->>Master: Cached JSON response
            else Cache Miss
                Master->>MCP: Execute weather_tool & hotel_tool (Parallel)
                MCP->>MCP: Access External APIs (OpenMeteo, Maps)
                MCP-->>Master: Normalized JSON data
                Master->>Redis: Set cache metadata keys with TTL
            end
        end

        %% Budgeting & Itinerary
        Master->>Master: Invoke Budget Agent (Compute breakdown + emergency)
        Master->>Master: Invoke Itinerary Agent (Day-by-Day Generation)
        Master-->>Serv: JSON Trip Proposal
        Serv->>DB: Store Proposed Trip Plan (Draft Status)
        Serv-->>User: Proposed Trip Markdown & JSON
    end

    %% Approval & Payment
    User->>API: POST /api/trips/:id/approve (User Approval)
    API->>Serv: finalizeAndBook(tripId)
    Serv->>BookingService: executeTripBooking(tripData)
    BookingService->>PaymentService: processCharge(chargeDetail)
    PaymentService-->>BookingService: Mock Payment Reference
    BookingService->>MCP: calendar_tool (Sync trip dates)
    BookingService->>DB: Update Trip State to "BOOKED", Save Booking Ref
    BookingService-->>User: Success response & Confirmation
```

---

## 3. AI Agent Architecture

Unlike models that delegate simple API tasks to AI, this design restricts AI agents to reasoning tasks. Anything that requires simple data retrieval or processing has been refactored into Tools or backend Services.

```
       Master Planner Agent (Cognitive Heart / Input Processor)
            │
            ├──────► Missing Info Agent (Validates slots / asks questions)
            ├──────► Destination Rec Agent (Interspliced LLM recommendation)
            ├──────► Budget Reasoning Agent (Ratios, shopping, emergency funds)
            └──────► Itinerary Gen Agent (Coordinates day scheduling constraints)
```

The system employs **5 true AI Agents**:

1. **Master Planner Agent**: Decides routing, parses natural language intent, processes state updates, orchestrates data aggregation, and interacts with the tool layer.
2. **Missing Info Agent**: Scans the input context to determine if critical fields (destination, start/end dates, base budget) are absent. Formulates targeted clarification questions.
3. **Destination Recommendation Agent**: Used when the destination is unspecified. Leverages past trip feedback and accessibility filters to present a validated destination.
4. **Budget Reasoning Agent**: Analyzes overall estimates, validates allocations (hotel, transit, food, activities), handles shopping and contingency thresholds, and ensures constraints are met.
5. **Itinerary Generation Agent**: Generates structured, day-by-day itineraries that match current weather conditions (e.g. pivoting to indoor attractions if there is rain) and user limits.

All other components (Weather, Transport, Accommodation, Activities, Local Transport, Booking, and Calendar) are executed as **deterministic tools** or service layer functions.

---

## 4. Model Context Protocol (MCP) Tool Layer

To decouple AI orchestration hooks from proprietary API schemas, external operations are handled using the Model Context Protocol (MCP). The Planner Agent calls these tools by outputting schema-validated function invocations:

* **`weather_tool`** (`weather-mcp-server`): Queries forecasts via OpenMeteo. Expects destination geo-coordinates and dates.
* **`maps_tool`** (`maps-mcp-server`): Translates destination strings to GPS coordinates and calculates route travel distances.
* **`hotel_tool`** (`booking-mcp-server`): Fetches rates, ratings, and room options from a mock accommodations index.
* **`transport_tool`** (`transit-mcp-server`): Fetches train and bus route availabilities, pricing, and timing estimations.
* **`calendar_tool`** (`calendar-mcp-server`): Syncs confirmed trip schedules to the user's Google Calendar.
* **`payment_tool`** (`booking-mcp-server`): Passes billing amounts to the mock payment gateway.

---

## 5. Traveler Planning Workflow

This workflow represents the corrected sequence of events from when a traveler starts a session to final confirmation and notification dispatch:

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef startEnd fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef service fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef agent fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    classDef tool fill:#f5c2e7,stroke:#f5c2e7,stroke-width:2px,color:#11111b;

    UserStart([Traveler Prompt]) --> AuthCheck["Auth Filter Middleware"]:::service
    AuthCheck --> LoadSession["Load User Profile & Memory"]:::service

    LoadSession --> MasterPlanner["Planner Agent (Master)"]:::agent
    MasterPlanner --> CheckMissing["Missing Info Agent"]:::agent

    CheckMissing --> IsComplete{"Is crucial info missing?"}:::service
    IsComplete -->|Yes| ClarifyPrompt(["Clarification Prompt Sent to User"]):::startEnd
    IsComplete -->|No| DestinationRec{"Destination specified?"}:::service

    DestinationRec -->|No| DestRecAgent["Destination Rec Agent"]:::agent
    DestinationRec -->|Yes| FetchParallel["Fetch Tool Data Parallel"]:::service

    DestRecAgent --> FetchParallel
    
    subgraph ParallelInfoGathering ["Deterministic Tool Phase (Promises.allSettled)"]
        Weather["weather_tool"]:::tool
        Transit["transport_tool"]:::tool
        Hotel["hotel_tool"]:::tool
        Activities["maps_tool (Places API)"]:::tool
    end

    FetchParallel --> ParallelInfoGathering
    ParallelInfoGathering --> BudgetAgent["Budget Reasoning Agent"]:::agent
    BudgetAgent --> ItinAgent["Itinerary Gen Agent"]:::agent

    ItinAgent --> ConfirmPlan{"Plan Feasible?"}:::service
    ConfirmPlan -->|No| BudgetAgent
    ConfirmPlan -->|Yes| UserReview(["Awaiting Approval (Draft State)"]):::startEnd

    UserReview --> ReviewConfirm{"Action Selected"}:::service
    ReviewConfirm -->|Approve| BookingService["Booking Service Layer"]:::service
    ReviewConfirm -->|Reject / Modify| ReplanningLogic["Replanning Context Handler"]:::service

    ReplanningLogic --> MasterPlanner

    BookingService --> Payments["Payment Service (Mock API)"]:::service
    Payments --> Calendar["calendar_tool Sync"]:::tool
    Calendar --> SaveToDB["Persist Booking State in DB"]:::service
    SaveToDB --> NotifyQueue["Dispatch to Notification Queue"]:::service
    NotifyQueue --> CompletedState([Confirmed & Completed]):::startEnd
```

---

## 6. API Layer Design

The system coordinates client demands through a standardized Express controller routing framework:

### Authentication Endpoints
* `POST /api/auth/register` — Creates user authentication profiles. Enforces password hashing.
* `POST /api/auth/login` — Verifies credentials, registers access tokens, and signs HTTP-only refresh cookies.
* `POST /api/auth/refresh` — Standardized OAuth-style rotation. Detects token reuse.
* `POST /api/auth/logout` — Destroys JWT context, invalidates tokens, and clears client session cookies.
* `POST /api/auth/forgot-password` — Dispatches unique time-bound password-reset tokens to user email profiles.
* `POST /api/auth/reset-password` — Updates password structure using verified reset tokens.

### Travel Planning & Booking Endpoints
* `POST /api/trips` — Initiates the Planner Agent pipeline with traveler prompts. Returns drafts or validation errors.
* `GET /api/trips` — Retrieves past, upcoming, and draft trip records for the authenticated user.
* `GET /api/trips/:id` — Retrives a specific trip profile with hotel bookings, transit routes, and itineraries.
* `PATCH /api/trips/:id` — Updates trip options manually (e.g. changing dates or hotel choices).
* `DELETE /api/trips/:id` — Cancels booking sessions and updates status to `CANCELLED`.
* `POST /api/trips/:id/approve` — Approves a draft itinerary and invokes the booking service.
* `POST /api/trips/:id/reject` — Rejects a proposal. Expects adjustment notes to trigger granular replanning.
* `POST /api/feedback` — Records rating metrics and trip notes to update the user's preference models in the database.

---

## 7. Database Schema & ER Diagram

MongoDB Atlas maintains records and configurations for the application.

```mermaid
erDiagram
    USERS {
        ObjectId id PK
        string email UK
        string passwordHash
        string firstName
        string lastName
        boolean isEmailVerified
    }
    
    PREFERENCES {
        ObjectId id PK
        ObjectId userId FK
        string travelStyle
        string dietaryPreference
        string budgetRange
        string[] languages
        string accessibilityNeeds
    }

    TRIPS {
        ObjectId id PK
        ObjectId userId FK
        string status
        string destination
        date startDate
        date endDate
        double totalCost
        object rawItinerary
    }

    BOOKINGS {
        ObjectId id PK
        ObjectId tripId FK
        string providerType
        string bookingReference
        string paymentStatus
        double pricePaid
    }

    CONVERSATIONS {
        ObjectId id PK
        ObjectId userId FK
        string sessionId
        array chatMessages
        date lastActive
    }

    NOTIFICATIONS {
        ObjectId id PK
        ObjectId userId FK
        string type
        string status
        string messagePayload
        date createdAt
    }

    USERS ||--|| PREFERENCES : "has"
    USERS ||--o{ TRIPS : "creates"
    USERS ||--o{ CONVERSATIONS : "initiates"
    TRIPS ||--o{ BOOKINGS : "contains"
    USERS ||--o{ NOTIFICATIONS : "receives"
```

---

## 8. Trip State Machine

Trips progress through a strict, validations-driven lifecycle state machine. State changes are verified at the service layer before updates are written to the database.

```mermaid
stateDiagram-v2
    [*] --> DRAFT : User enters prompt / incomplete setup
    DRAFT --> PLANNING : Missing parameters resolved / Parallel execution started
    PLANNING --> AWAITING_APPROVAL : Itinerary generated & validated
    
    AWAITING_APPROVAL --> PLANNING : Rejection with modification prompts
    AWAITING_APPROVAL --> APPROVED : Traveler accepts proposal
    
    APPROVED --> BOOKING : Booking Service initialized, checking payment gateway
    
    BOOKING --> BOOKED : Payment verified, references returned, calendar synced
    BOOKING --> AWAITING_APPROVAL : Payment failed / Inventory sold out
    
    BOOKED --> COMPLETED : Current date exceeds trip endDate
    BOOKED --> CANCELLED : Traveler cancels trip via dashboard
    
    AWAITING_APPROVAL --> CANCELLED : Traveler discards draft session
    DRAFT --> CANCELLED : Session timeout / abandoned
    CANCELLED --> [*]
    COMPLETED --> [*]
```

---

## 9. Prompt Engineering Layer

Prompt templates decouple prompt definition from application logic. Structured templates are stored in a dedicated backend directory (`server/src/prompts/`):

- **Master Planner Input Prompt** (`planner.prompt.ts`): Processes traveler intent, extracts parameters, and identifies slots.
- **Destination Recommendation Prompt** (`destination.prompt.ts`): Identifies optimal travel locations using user preferences, accessibility settings, and weather data.
- **Budget Reasoning Prompt** (`budget.prompt.ts`): Reconciles raw tool values against budget limits, calculated reserves, and hidden costs.
- **Itinerary Generation Prompt** (`itinerary.prompt.ts`): Builds daily markdown calendars that incorporate local activities and transit data.

```
┌─────────────────────────────────────────────────────────────┐
│  System Context (Instructions, Safety Limits & Schemas)     │
├─────────────────────────────────────────────────────────────┤
│  Few-Shot Examples (Parsed inputs → Structured outputs)     │
├─────────────────────────────────────────────────────────────┤
│  User Context (Profile preferences, past activities)       │
├─────────────────────────────────────────────────────────────┤
│  JSON Schema Constraint (Validates output format)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. JSON Validation & Structured Output Parser

To prevent malformed LLM responses from causing application errors, the system wraps all agent invocations in a structured validation layer.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef process fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef success fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef error fill:#f38ba8,stroke:#f38ba8,stroke-width:2px,color:#11111b;

    LLMOut["Agent LLM Output String"] --> JSONParser["JSON Parser Engine"]:::process
    
    JSONParser -->|Failure| IncrementRetry{"Retry limit reached?"}:::process
    JSONParser -->|Success| ZodValidate["Zod Schema Verification"]:::process
    
    ZodValidate -->|Invalid schema| IncrementRetry
    ZodValidate -->|Valid schema| SuccessReturn["Return Typed JSON Object"]:::success
    
    IncrementRetry -->|No| RePrompt["Re-Prompt LLM with error logs"]:::process
    IncrementRetry -->|Yes| Fallback["Execute Graceful Fallback Handler"]:::error
    
    RePrompt --> LLMOut
```

If parsing fails, the system automatically runs up to **two retries**, appending the error logs to the prompt code to guide correct formatting on the next attempt.

---

## 11. Confidence & Fallback Flow

To ensure plan validity, the Itinerary and Budget Agents execute automated quality checks on outputs:

```
                  ┌────────────────────────────────────────┐
                  │ LLM Structured Output Parsing Completed │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │ Validate constraints against tool checks│
                  │ E.g. Check check-in times & travel caps│
                  └───────────────────┬────────────────────┘
                                      │
                                    ┌─┴─┐
                                  Yes   No
                                ┌───┘   └───┐
                                ▼           ▼
           ┌─────────────────────────┐ ┌───────────────────────────┐
           │ Confidence Score = 1.0  │ │Confidence Score = 0.0     │
           │ Accept Plan Proposal    │ │Run correction pass (max 2)│
           └─────────────────────────┘ └────────────┬──────────────┘
                                                    │
                                                  ┌─┴─┐
                                               Success Failure
                                              ┌─────┘   └─────┐
                                              ▼               ▼
                                         Accept Plan      Trigger Fallback
                                         Proposal         Graceful Error
```

If checks fail after correction passes, the system uses fallback configurations (e.g. suggesting safe defaults) rather than letting invalid coordinates or budgets crash the application.

---

## 12. Memory Architecture & Long-Term Update Policy

The application uses a **dual-layer memory model** designed to maintain context during a session while capturing user preferences over time.

```
                  ┌─────────────────────────────────────┐
                  │        Incoming Conversation        │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │   Short-Term Session Memory Store   │
                  │ (Maintains context during planning) │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Preference Extraction LLM      │
                  │    (Detects changes & new choices)  │
                  └──────────────────┬──────────────────┘
                                     │
                                  ┌──┴──┐
                                 Yes    No
                               ┌───┘    └───┐
                               ▼            ▼
             ┌─────────────────────┐   ┌───────────────┐
             │ Update Preferences  │   │  Ignore Event │
             │  Long-term MongoDB  │   │               │
             └─────────────────────┘   └───────────────┘
```

* **Short-Term Memory**: Session-scoped Chat History (persisted in MongoDB `conversations` database) that provides conversation context during the planning flow.
* **Long-Term Memory**: Persistent User Preference profiles (persisted in MongoDB `preferences`). To avoid cluttering profiles with trivial details, long-term memory is updated selectively:
  1. Once a trip is finalized, the **Preference Extraction Engine** analyzes the booking choices.
  2. If the user explicitly notes preferences during chat (e.g., "I only eat vegetarian food" or "I need wheelchair access"), these values are updated in MongoDB.
  3. These preferences are loaded as system context variables during future planning runs.

---

## 13. User Profile System & Context Extraction

At the start of the planning pipeline, the API loads the user's profile and active preferences. This ensures user context shapes all planning decisions.

```json
{
  "userId": "usr_6782f9b8cde",
  "preferences": {
    "travelStyle": "adventure",
    "dietaryPreference": "vegetarian",
    "budgetRange": "mid-range",
    "languages": ["English", "Tamil"],
    "accessibilityNeeds": "wheelchair"
  },
  "pastTrips": [
    {
      "destination": "Ooty, TN",
      "rating": 5,
      "budgetSpent": 32000
    }
  ],
  "family": {
    "adults": 2,
    "children": 1
  }
}
```

This metadata is combined with new traveler inputs to configure agent workflows and ensure recommendations stay within budget constraints.

---

## 14. Granular Replanning Logic

When a user requests a change during review, the system does not regenerate the entire itinerary. Instead, the Planner Agent updates only the components affected by the new parameters.

```
       Change request received: "Change Hotel Budget"
            │
            ├────────► Identify affected components: Accommodation, Budget Breakdown
            │
            ├────────► RE-RUN: hotel_tool (Fetch new options)
            ├────────► RE-RUN: Budget Reasoning Agent (Re-calculate allocations)
            ├────────► RE-RUN: Itinerary Gen Agent (Update affected daily schedules)
            │
            └────────► SKIPPED: weather_tool, transport_tool, activity_tool (Cached)
```

By using localized updates and cached tool results, the system reduces LLM token consumption while processing requests in under 2 seconds.

---

## 15. Complete Budget Model

The Budget Reasoning Agent evaluates total estimated expenses using a complete cost model. This prevents budget overruns by accounting for fees and contingencies:

```
╔═════════════════════════════════════════════════════════════════════╗
║                   GRAND TOTAL TRIP COST BUILD                       ║
╠═════════════════════════════════════════════════════════════════════╣
║  [+] Long-Distance Transport (Flights/Trains/Intercity Buses)       ║
║  [+] Accommodation (Room rent per night * total stay)               ║
║  [+] Meals & Dining (Daily allowance per seat * travelers)          ║
║  [+] Activity Passes (Entry tickets, sightseeing bookings)          ║
║  [+] Local Transport (Cabs, auto rides, bike rentals)               ║
║  [+] Taxes & Service Fees (GST estimation: 18% hotel, 5% transit)   ║
║  [+] Fuel & Parking Fees (Applicable for road-trips)                ║
║  [+] Shopping Allowance (Purchases limit allocated)                 ║
║  [+] Emergency Reserve Fund (10% Buffer automatically added)        ║
║  [+] Miscellaneous Hidden Costs (Tips, water, emergency transit)    ║
╚═════════════════════════════════════════════════════════════════════╝
```

Plans are rejected as infeasible if the total (including the emergency buffer) exceeds the user's spending limit.

---

## 16. Booking & Payment Service Layer

Bookings are handled by system services, not AI agents. This guarantees reliable transaction processing.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef step fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef api fill:#f5c2e7,stroke:#f5c2e7,stroke-width:2px,color:#11111b;

    ApprovedState(["Trip Approved"]) --> InitAuth["Booking Service Initialized"]:::step
    InitAuth --> LockInventory["Lock Inventory Slots (Transient lock)"]:::step
    
    LockInventory --> PayGateway["Charge Payment Method (Mock stripe)"]:::api
    PayGateway -->|Payment Verification Success| CreateRefs["Generate Booking References"]:::step
    PayGateway -->|Payment Failed| Rollback["Release Inventory & Warn User"]:::step
    
    CreateRefs --> WriteDB["Save Booking Record to MongoDB"]:::step
    WriteDB --> TriggerSync["Trigger calendar_tool MCP Event"]:::api
    TriggerSync --> Completed(["Booking Confirmed"])
```

---

## 17. Background Notification Queue

To prevent page-load delays during booking confirmation, post-booking tasks are processed off the main thread using an event queue (Bull/Redis).

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef producer fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef consumer fill:#f9e2af,stroke:#f9e2af,stroke-width:2px,color:#11111b;
    classDef queue fill:#fab387,stroke:#fab387,stroke-width:2px,color:#11111b;

    BookingEvent["Booking Event Fired"]:::producer --> DirectQueue["Add to Redis Queue (Bull)"]:::queue
    
    subgraph BullQueueProcessor ["Worker Process (Async Node Worker)"]
        DirectQueue --> JobPickup["Worker picks up Job"]:::consumer
        JobPickup --> EmailTask["Nodemailer Ticket Email"]:::consumer
        JobPickup --> PushTask["WebPush API Notification"]:::consumer
        JobPickup --> CalSyncTask["calendar_tool API Call"]:::consumer
    end

    EmailTask --> Done(["Task Complete"])
    PushTask --> Done
    CalSyncTask --> Done
```

If tasks fail, the queue retries processing using an backoff schedule.

---

## 18. Redis Cache Strategy (TTL & Key Design)

An in-memory Redis layer stores API search results to avoid redundant external network requests:

### Key Naming Conventions
* **Weather Cache**: `weather:{coordinates}:{start_date}:{end_date}`
* **Hotel Listings**: `accommodation:{destination_coordinates}:{check_in}:{check_out}`
* **Transit Routes**: `transport:{origin_coordinates}:{destination_coordinates}:{date}`
* **Google Places Details**: `places:{destination}:{interests}`
* **User Session Cache**: `session:{userId}:active`

### Time-to-Live (TTL) Configurations
* Weather records expire after **6 hours** to ensure forecasts remain accurate.
* Hotel search results expire after **24 hours** to match inventory changes.
* Transit listings expire after **12 hours** to keep schedule data up to date.
* Google Places attraction data is cached for **7 days** since landmarks rarely change.

When the Redis instance memory limit is reached, it uses the `allkeys-lru` eviction policy to discard the least recently used keys.

---

## 19. LLM Cost Optimization Strategy

The architecture includes optimizations to reduce dependency on external LLMs and lower operating costs:

1. **Deterministic Logic Routing**: Simple tasks (extracting dates, fetching coordinates, or loading profile preferences) are processed using code rather than LLM prompts.
2. **Parallel Dispatching**: Gathering operations are run concurrently via `Promises.allSettled`, minimizing API wait times.
3. **Structured caching**: The planning service checks Redis before invoking the master agent, utilizing cached data when possible to avoid new LLM processing costs.
4. **Deterministic Settings**: The model controls formatting by using a temperature setting of `0` and structured schemas, reducing retry expenses caused by parsing errors.

---

## 20. Security & Authentication Architecture

User data and API endpoints are protected by multi-layered middleware controls.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef middleware fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef api fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef danger fill:#f38ba8,stroke:#f38ba8,stroke-width:2px,color:#11111b;

    ClientInput["Secure Request (Authorization: Bearer <JWT>)"] --> HelmetShield["Helmet Header Filter"]:::middleware
    
    HelmetShield --> CORSConn["CORS Domain Validator"]:::middleware
    CORSConn --> RateLimiter["IP Rate Limiter"]:::middleware
    
    RateLimiter --> TokenCheck{"Valid Access Token?"}:::middleware
    
    TokenCheck -->|No| RefreshFlow{"Valid Refresh Token?"}:::middleware
    TokenCheck -->|Yes| RBACCheck{"Check RBAC (Role match)"}:::middleware
    
    RefreshFlow -->|Yes| IssueToken["Issue New Token (Rotate context)"]:::middleware
    RefreshFlow -->|No / Expired| AccessDenied["401 Unauthorized Response"]:::danger
    
    IssueToken --> RBACCheck
    
    RBACCheck -->|Unauthorized Role| RoleDenied["403 Forbidden Response"]:::danger
    RBACCheck -->|Authorized Role| Sanitizer["Input Sanitization (express-validator)"]:::middleware
    
    Sanitizer --> ProtectedRoute["Route Controller Action"]:::api
```

- **Credential Hashing**: User passwords are saved as secure hashes using `bcrypt` with a minimum cost of 12 rounds.
- **Short-Lived Access Tokens**: Session access tokens use a 15-minute expiration window to limit token exposure.
- **Refresh Token Rotation**: Refresh tokens are stored in secure HTTP-only cookies. Using a refresh token invalidates previous issues, preventing token reuse.
- **Secure Configuration**: Third-party API credentials, MongoDB keys, and JWT salts are retrieved at launch from the AWS SSM Parameter Store.

---

## 21. Folder Structure

The repository organizes backend services, agent reasoning libraries, and frontend elements in the following directory layout:

```
travel-planner-ai/
├── client/                     # Web interface
│   ├── src/
│   │   ├── components/         # Shared UI (Zod Hook Forms, charts layout)
│   │   ├── pages/              # User profiles, admin panels, planner
│   │   ├── hooks/             # Custom state & server query hooks
│   │   ├── services/           # Axios REST endpoint controllers
│   │   └── schemas/            # Zod validation schemas
│   └── vite.config.ts
│
├── server/                     # Express API
│   ├── src/
│   │   ├── controllers/        # Route handler functions
│   │   ├── routes/             # Authentication & planning routes
│   │   ├── middlewares/        # JWT auth, rate limits, validators
│   │   ├── services/           # Orchestrator (PlannerService, BookingService)
│   │   ├── agents/             # Reasoning models (Planner, Budget, etc.)
│   │   │   ├── planner.agent.ts
│   │   │   ├── missing-info.agent.ts
│   │   │   ├── destination.agent.ts
│   │   │   ├── budget.agent.ts
│   │   │   └── itinerary.agent.ts
│   │   ├── prompts/            # prompt files
│   │   ├── models/             # Mongoose schemas
│   │   ├── repositories/       # MongoDB interface classes
│   │   ├── memory/             # Short & Long memory update logic
│   │   ├── cache/              # Redis interface wrapper
│   │   ├── parsers/            # Zod output validation parsers
│   │   └── utils/              # Error handling & logger utilities
│   └── package.json
│
├── mcp/                        # Standalone MCP servers
│   ├── weather-mcp/            # OpenMeteo forecast client
│   ├── maps-mcp/               # Google Maps places & routing client
│   ├── transit-mcp/            # Mock bus & rail search client
│   ├── booking-mcp/            # Hotel inventory and payment gateway client
│   └── calendar-mcp/           # Google Calendar syncing client
│
├── docker/                     # Container configurations
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── terraform/                  # Infrastructure configurations
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
│
└── README.md                   # System documentation
```

---

## 22. Class Diagram

This class diagram shows the relationships between core service managers, databases, and agents:

```mermaid
classDiagram
    class PlannerService {
        +generatePlan(userId, prompt) Trip
        +finalizeAndBook(tripId) Booking
        +processReplanning(tripId, reasons) Trip
    }

    class BookingService {
        -paymentService PaymentService
        -notificationService NotificationService
        +executeTripBooking(tripData) BookingReference
    }

    class UserRepository {
        +getUserProfile(userId) UserProfile
        +updateUserPreferences(userId, prefs) Boolean
    }

    class TripRepository {
        +saveTrip(trip) Trip
        +getTripById(tripId) Trip
        +updateTripStatus(tripId, status) Boolean
    }

    class PlannerAgent {
        -missingInfoAgent MissingInfoAgent
        -destAgent DestinationAgent
        -budgetAgent BudgetAgent
        -itineraryAgent ItineraryAgent
        +startPlanningPipeline(Context) TripJSON
    }

    class RedisCacheManager {
        -client RedisClient
        +get(key) JSON
        +setex(key, ttl, value) Boolean
        +invalidatePattern(pattern) Boolean
    }

    PlannerService --> PlannerAgent : uses
    PlannerService --> UserRepository : queries
    PlannerService --> TripRepository : updates
    PlannerService --> BookingService : delegates
    PlannerService --> RedisCacheManager : checks
    BookingService --> TripRepository : modifies
```

---

## 23. CI/CD & Deployment Flow

Infrastructure is provisioned using Terraform, and updates are deployed to AWS instances through a GitHub Actions CI/CD pipeline.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef trigger fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef step fill:#fab387,stroke:#fab387,stroke-width:2px,color:#11111b;
    classDef dest fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;

    CodeChange["Push to github main branch"]:::trigger --> CITrigger["Merge / Actions Trigger"]:::trigger
    
    subgraph BuildAndVerify ["Verify & Build Image"]
        CITrigger --> LintTask["Run Linters & Formatter"]:::step
        LintTask --> AuditTask["Vulnerability Audit Check"]:::step
        AuditTask --> TestSuite["Run Backend Tests"]:::step
        TestSuite --> BuildDocker["Build API Docker Image"]:::step
    end
    
    subgraph ContainerRegistry ["Store Image"]
        BuildDocker --> PushesECR["Upload Image to Amazon ECR"]:::step
    end

    subgraph AWSIacProvision ["Provision Environment"]
        TerraformTask["Terraform Plan & Apply"]:::step --> S3Upload["Upload Build Static to S3"]:::dest
        TerraformTask --> RouteConfigure["Configure CloudFront CDN Routing"]:::dest
    end

    PushesECR --> PullImage["EC2 Agent pulls latest image"]:::dest
    S3Upload --> DeploySuccess["Deployment Live Status"]:::dest
    PullImage --> DeploySuccess
```

---

## 24. Rate Limiting Flow

A Redis-backed rate limiter protects endpoints from denial-of-service attempts and resource exhaustion.

```mermaid
graph TD
    classDef default fill:#1e1e2e,stroke:#cdd6f4,stroke-width:2px,color:#cdd6f4;
    classDef process fill:#89b4fa,stroke:#89b4fa,stroke-width:2px,color:#11111b;
    classDef allow fill:#a6e3a1,stroke:#a6e3a1,stroke-width:2px,color:#11111b;
    classDef deny fill:#f38ba8,stroke:#f38ba8,stroke-width:2px,color:#11111b;

    HttpRequest["Incoming API Request"] --> ExtractIP["Extract Requesting IP & Route Context"]:::process
    ExtractIP --> RedisLookup["Query key: rate_limit:ip:{route} in Redis"]:::process
    
    RedisLookup --> IPExists{"Request limit exceeded?"}:::process
    
    IPExists -->|Yes| ThrottleReturn["Return HTTP 429 Too Many Requests"]:::deny
    IPExists -->|No| IncrementCount["Increment Redis Request Count"]:::process
    
    IncrementCount --> PassToRouter["Forward Request to Router Middleware"]:::allow
```

---

## 25. Observability & Error Redirection Matrix

Structured application events and error logs are captured using the Winston logger and monitored via AWS CloudWatch:

| Event Source | Severity | Logging Attributes | Fallback Response |
|:---|:---|:---|:---|
| **Express Middleware** | `warn` | `ip`, `route`, `requestId`, `userAgent` | `400 Bad Request` or `429 Throttle` response |
| **Authentication System** | `warn` | `email`, `authRef`, `requestId` | `401 Access Expired` standard response |
| **Master Planner Agent** | `error` | `userId`, `conversationId`, `errorDetails` | `500 Server Error` response with system reset |
| **JSON Output Parser** | `warn` | `rawText`, `parsingErrors`, `retryAttempt` | Re-prompt LLM with correct schema rules |
| **weather_tool (MCP)** | `error` | `coordinates`, `dateRange`, `status` | Use cached metrics or a default weather fallback |
| **hotel_tool (MCP)** | `error` | `destination`, `checkingIn`, `status` | Warn traveler that accommodation listings are offline |
| **MongoDB Atlas** | `error` | `operation`, `stackTrace`, `durationMs` | `503 Service Unavailable` graceful error response |
| **Google Calendar MCP** | `warn` | `userId`, `oauthTokenStatus` | Skip event creation and notify the user |

All application logs contain a unique `requestId` (UUID v4) tag, letting developers trace issues from the public entry route down to tool execution and database commits.

---

## 26. Technical Stack

* **Frontend**: React (Vite, TailwindCSS, TanStack Query, Axios, Chart.js)
* **Backend Framework**: Node.js + Express (TypeScript, MVC Architecture)
* **AI & Orchestration**: LangChain, Groq LLM API, Model Context Protocol
* **Database & Cache**: MongoDB Atlas (Mongoose), Redis (Self-hosted on EC2 / Redis Cloud)
* **Background Jobs Queue**: Bull MQ (Redis-backed job scheduling)
* **Infrastructure**: Terraform, GitHub Actions, Docker Compose, Nginx, AWS EC2, AWS S3, CloudFront
