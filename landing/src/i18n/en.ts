import type { Dict } from "./tr";

export const en: Dict = {
  meta: {
    locale: "en",
    htmlLang: "en",
    siteName: "Projelio",
    tagline: "Business management with an AI assistant",
    title: "Projelio — The AI teammate that keeps track of your work",
    description:
      "Projelio brings projects, tasks, budgets, customers and department modules into one panel. Lio, the built-in AI assistant, knows your company data: ask and it answers, tell it and it acts.",
    keywords:
      "ai assistant, ai work assistant, project management, task tracking, team management, crm, budget tracking, department modules",
  },

  nav: {
    features: "Features",
    lio: "Lio",
    modules: "Modules",
    screenshots: "Screenshots",
    demoAccount: "Demo account",
    pricing: "Pricing",
    credits: "Credits",
    faq: "FAQ",
    contact: "Contact",
    login: "Sign in",
    cta: "Start free",
    menu: "Menu",
    close: "Close",
  },

  common: {
    tryLio: "Try Lio",
    seePricing: "See pricing",
    startFree: "Start free",
    talkToUs: "Talk to us",
    allFeatures: "See all features",
    monthly: "Monthly",
    yearly: "Yearly",
    save: "2 months free",
    perMonth: "/mo",
    perUserMonth: "/user/mo",
    vatNote: "Prices exclude VAT.",
    mostPopular: "Most popular",
    backHome: "Back to home",
    updatedAt: "Last updated",
  },

  hero: {
    badge: "New — Lio now works across every module",
    titleA: "Give your team an",
    titleHighlight: "AI teammate that keeps track",
    titleB: "",
    lede: "Lio is an assistant that knows your projects, tasks, budget and customers. Ask and it answers, tell it and it acts — and it flags whatever is stuck before you even ask.",
    ctaPrimary: "Try Lio now",
    ctaSecondary: "View plans",
    proof: [
      "2-minute setup",
      "No credit card required",
      "14-day free trial",
      "GDPR/KVKK compliant, data stays local",
    ],
  },

  demo: {
    eyebrow: "Live demo",
    title: "Message Lio and see what it can do",
    lede: "The conversation below runs on real Lio scenarios. Tap a sample question or write your own — no sign-up needed.",
    assistantName: "Lio",
    assistantRole: "Projelio AI assistant",
    online: "online",
    placeholder: "Write something to Lio…",
    send: "Send",
    reset: "Reset chat",
    note: "This is a product demo running on sample company data. In your own account Lio connects to your real projects.",
    suggestionsLabel: "Sample questions",
    remaining: "demo messages left",
    limitTitle: "You've used up the demo",
    limitText:
      "Lio's real work starts on your own projects, not here. Create a free account and let Lio work on your actual tasks, budget and customers from day one.",
    limitCta: "Create a free account",
    limitReset: "Restart the demo",
    greeting:
      "Hi, I'm Lio 👋\nI'm connected to a sample Projelio account. Tap one of the examples below or write your own sentence.",
    fallback:
      "This demo has a limited set of sample scenarios. The real Lio understands the full range of task, project, budget, customer and reporting commands.\n\nTry one of the ready-made questions below, or open a free account and talk to Lio using your own data.",
    scenarios: [
      {
        chip: "What's on my plate today?",
        user: "What's on my plate today?",
        reply:
          "You have 4 items today 👇\n\n1. Galata Residences — homepage design · 16:00\n2. Aydın Construction — proposal revision · 18:00\n3. Share the team meeting notes · today\n4. Upload July invoices · overdue ⚠️\n\nWrite \"start 1\" and I'll move the first one to In progress.",
      },
      {
        chip: "Start 1",
        user: "Start 1",
        reply:
          "✅ \"Galata Residences — homepage design\" started.\n\nStatus: In progress\nTime tracking on · I'll remind you at 16:00\nProject progress: 62% → 62% (71% once the task is done)",
      },
      {
        chip: "How much revenue came in this week?",
        user: "How much revenue came in this week?",
        reply:
          "📊 Week of Aug 5–11\n\nRevenue: ₺148,500 (4 payments)\nExpenses: ₺37,200\nNet: ₺111,300 · +18% vs. last week\n\nOutstanding: ₺62,000 (2 invoices, 9 days late on average)\nFor details: \"list overdue invoices\"",
      },
      {
        chip: "Where do we stand with Aydın Construction?",
        user: "Where do we stand with Aydın Construction?",
        reply:
          "🏢 Aydın Construction Inc. — Customer record\n\nOpen projects: 2 · Total budget ₺320,000\nLast contact: Aug 6, proposal sent (6 days ago)\nPending: Proposal revision — today 18:00\nOpen invoice: ₺62,000, 3 days past due\n\nSuggestion: sending the revision today keeps the deal on track to close within 7 days.",
      },
      {
        chip: "Send me the weekly summary",
        user: "Send me the weekly summary",
        reply:
          "📬 Your weekly summary:\n\n• Completed tasks: 23 (17 last week)\n• Overdue tasks: 3 — all in Production\n• Active projects: 7 · Closed this week: 1\n• Team utilisation: 78%\n\nBiggest bottleneck: the \"Proposal approval\" step — 4 items wait an average of 3.2 days there.\n\nWant me to send this automatically every Monday at 09:00?",
      },
      {
        chip: "Create a task for tomorrow",
        user: "Create a task to send Mehmet the contract draft tomorrow at 11:00",
        reply:
          "✅ Task created.\n\nTitle: Send Mehmet the contract draft\nDate: Tomorrow 11:00\nAssignee: You\nProject: Aydın Construction — Phase 2\nLabel: Legal\n\nI set a reminder 30 minutes before. To reassign, just write \"assign to Ayşe\".",
      },
    ],
  },

  stats: {
    items: [
      { value: 57, suffix: "", label: "ready-made modules" },
      { value: 11, suffix: "", label: "departments" },
      { value: 2, suffix: " min", label: "average setup" },
      { value: 14, suffix: " days", label: "free trial" },
    ],
  },

  demoAccount: {
    eyebrow: "No sign-up, no form",
    title: "Look around without an account",
    lede: "We keep a demo account open for you. It is filled with a sample manufacturing company's projects, tasks, budget and reports — one click and you are inside.",
    emailLabel: "Email",
    passwordLabel: "Password",
    cta: "Enter the demo account",
    ctaNote: "The link opens the sign-in screen with the fields already filled in.",
    points: [
      "No card details, no registration.",
      "Every module is unlocked, Lio included — try it, ask it, add things.",
      "Every sign-in resets the demo to its original state — poke around freely.",
    ],
    warning:
      "The demo account is public and other visitors may be inside it at the same time. Anything you type can be seen by them, so please don't enter real or personal data.",
    resetNote:
      "Anything you add, change or delete is rolled back on the next sign-in.",
    ownAccount: "If you'd rather start with your own data",
  },

  live: {
    eyebrow: "See it running",
    title: "The journey of one task in Projelio",
    lede: "The screen below plays by itself. Lio opens the task, the team moves the board along, and the budget and reports update in the background.",
    frame: "projelio.app/dashboard",
    steps: [
      { title: "Lio opens the task", text: "It extracts the date, the assignee and the project from your sentence." },
      { title: "The team moves the board", text: "The card changes column and time tracking starts." },
      { title: "The budget follows", text: "Progress payments and spend flow into the project budget." },
      { title: "The report reaches you", text: "Weekly summary plus a heads-up on the step that's stuck." },
    ],
  },

  problem: {
    eyebrow: "Sound familiar?",
    title: "Team software doesn't fail — people just stop opening it",
    lede: "Most tools ask you to manage the tool before you can manage the work: menus, forms, fields to fill in. In Projelio, Lio carries that load.",
    items: [
      {
        title: "A dashboard with no data",
        text: "People forget to update tasks and within two weeks the board no longer reflects reality. So you end up asking each person where things stand.",
      },
      {
        title: "Work scattered across tools",
        text: "Tasks live in one place, income and expenses in a spreadsheet, customer notes on someone's phone. Pulling it together eats a full day each month.",
      },
      {
        title: "Foreign tools, foreign workflows",
        text: "Half-translated interfaces, English-only support, invoices in dollars. Local tax rules, e-invoicing and data regulations were never considered.",
      },
    ],
  },

  how: {
    eyebrow: "How it works",
    title: "Set up in three steps",
    lede: "Average setup takes 2 minutes. No training, no consultant, no implementation fee.",
    steps: [
      {
        title: "Open your account",
        text: "Sign up with an email and enter your company name. Pick the template that matches your industry — projects, workflow and departments arrive pre-configured.",
      },
      {
        title: "Pick your team and modules",
        text: "Enable only the modules you need: tasks, budget, CRM, HR, inventory… Each team member sees only their own department's data.",
      },
      {
        title: "Put Lio to work",
        text: "Lio learns your data on day one. Ask \"what's due today?\" and it lists what's late; say \"assign to Ayşe\" and it does. Connect it to WhatsApp too if you like.",
      },
    ],
  },

  lio: {
    eyebrow: "Lio · AI assistant",
    title: "Your team's fastest colleague",
    lede: "Lio isn't a chatbot — it genuinely acts on your Projelio data. Say what you need in your own words and it understands and executes.",
    items: [
      {
        title: "Natural language",
        text: "\"Finished yesterday's job\", \"assign it to Ahmet\", \"show this month's expenses\" — no command syntax to memorise. Typos and everyday phrasing are fine.",
      },
      {
        title: "Wherever you are",
        text: "In the web panel, in the mobile app and — if you want — on WhatsApp. Field crews and subcontractors join in without installing anything.",
      },
      {
        title: "Opens and closes tasks",
        text: "It extracts the date, assignee, project and label straight from your sentence, sets the reminder itself and asks you to confirm.",
      },
      {
        title: "Produces reports",
        text: "Weekly summaries, department load, overdue work, cash flow. Ask any time, or schedule it to arrive automatically.",
      },
      {
        title: "Points out the bottleneck",
        text: "It sees which step things pile up at and tells you why. You get to decide instead of reading reports.",
      },
      {
        title: "Respects permissions",
        text: "Lio never shows more than the user could see in the panel. Department and role rules apply identically in chat.",
      },
    ],
  },

  modules: {
    eyebrow: "Department modules",
    title: "Your whole company in one panel",
    lede: "Projelio ships with a catalogue of 57 modules. You enable only what you need, and team members see only their own department's data.",
    cta: "Request the module catalogue",
    items: [
      { slug: "yonetim", title: "Management", text: "Company-wide dashboard, goals, decision tracking and executive reports." },
      { slug: "muhasebe", title: "Finance & Accounting", text: "Income and expense ledger, invoice tracking, cash flow and project budgets." },
      { slug: "satis", title: "Sales", text: "Proposal pipeline, opportunity tracking, sales targets and close rates." },
      { slug: "musteri", title: "Customers (CRM)", text: "Customers, suppliers and leads on one record, with the full contact history." },
      { slug: "pazarlama", title: "Marketing", text: "Campaign plans, content calendar, social media and ad budgets." },
      { slug: "ik", title: "Human Resources", text: "Hiring, leave, payroll tracking, performance and onboarding flows." },
      { slug: "uretim", title: "Production", text: "Work orders, production plans, capacity and quality control steps." },
      { slug: "lojistik", title: "Logistics & Inventory", text: "Stock, shipments, delivery tracking and warehouse movements." },
      { slug: "urun", title: "Product", text: "Roadmap, release planning, feedback pool and feature prioritisation." },
      { slug: "teknoloji", title: "Technology", text: "Development board, bug tracking, environments and access management." },
      { slug: "hukuk", title: "Legal & Contracts", text: "Contract archive, renewal alerts, approval flows and compliance checks." },
    ],
  },

  features: {
    eyebrow: "Platform",
    title: "Everything the day needs",
    lede: "A capable system even without Lio. With Lio, a system that changes how fast your team moves.",
    items: [
      { title: "Task board", text: "To do / In progress / Done columns, drag and drop, subtasks and checklists." },
      { title: "Calendar view", text: "Daily, weekly and monthly views. \"Just my work\" or the whole team calendar." },
      { title: "Project budget", text: "Contract value, progress payments, spend and margin — tracked live per project." },
      { title: "Live notifications", text: "Instant on web, push on mobile, digest on WhatsApp. Each at its own rhythm." },
      { title: "Mobile app", text: "Projelio for iOS and Android, with offline notes and photos from the field." },
      { title: "Files and archive", text: "Attach files to tasks and customer records, connect Google Drive, keep version history." },
      { title: "Roles and permissions", text: "Department-level visibility — decide who sees what down to the module." },
      { title: "Reports and export", text: "Excel/CSV export, ready-made executive reports and customisable dashboards." },
    ],
  },

  screenshots: {
    eyebrow: "See it on screen",
    title: "Not complicated, and never crowded",
    lede: "The Projelio interface is built around one job: showing what needs doing today at a glance.",
    items: [
      {
        title: "Dashboard",
        text: "Active projects, upcoming deadlines and total budget, with project cards underneath.",
        frame: "projelio.app/dashboard",
        kind: "dashboard",
      },
      {
        title: "Task board",
        text: "A three-column kanban. Drag a card and status and progress update themselves.",
        frame: "projelio.app/project/galata",
        kind: "kanban",
      },
      {
        title: "Budget and cash flow",
        text: "Income, expenses and remaining budget per project, with overdue payments highlighted.",
        frame: "projelio.app/finance",
        kind: "finance",
      },
      {
        title: "Chatting with Lio",
        text: "Write from the panel, mobile or WhatsApp; Lio performs the action and you see it in the panel instantly.",
        frame: "Lio · chat",
        kind: "chat",
      },
    ],
  },

  compare: {
    eyebrow: "Comparison",
    title: "Why Projelio?",
    lede: "Global tools are powerful, but they weren't designed for how teams here actually work. These are the differences you feel daily.",
    columns: ["", "Projelio", "Generic project tools", "Spreadsheets + WhatsApp"],
    rows: [
      ["AI assistant (Lio)", "yes", "partial", "no"],
      ["Natural-language commands", "yes", "no", "no"],
      ["Department-based module system", "yes", "partial", "no"],
      ["Income/expense and project budgets", "yes", "partial", "partial"],
      ["CRM and proposal tracking", "yes", "partial", "no"],
      ["Local currency billing and payment methods", "yes", "no", "yes"],
      ["Local data regulation compliance and support", "yes", "no", "partial"],
      ["Access over WhatsApp", "yes", "no", "partial"],
      ["Automatic weekly executive report", "yes", "partial", "no"],
      ["Cost per user", "Low", "High", "Hidden cost"],
    ],
    legend: { yes: "Yes", no: "No", partial: "Partial" },
  },

  security: {
    eyebrow: "Trust",
    title: "Your data is yours, and stays that way",
    lede: "Projelio takes company data seriously. We write it all down because we'd rather be transparent.",
    items: [
      { title: "Compliant processing", text: "Privacy notice, consent flow and data subject request process ship ready to use." },
      { title: "Encrypted in transit and at rest", text: "All traffic over TLS, database encrypted at disk level, backups taken daily." },
      { title: "Role-based access", text: "Permissions at department and module level. Who saw what stays in the audit log." },
      { title: "Never used for training", text: "Your content is not used to train AI models and is never sold to third parties." },
      { title: "Export whenever you want", text: "Download everything as Excel/CSV. On account closure data is permanently deleted within 30 days." },
      { title: "Transparent uptime history", text: "Service status and past incidents are published on a public status page." },
    ],
  },

  ctaBand: {
    title: "Let your team ask fewer questions this week",
    text: "Try it free for 14 days. No card required, no setup fee, cancel whenever you like.",
    primary: "Create a free account",
    secondary: "Request a demo",
  },

  pricing: {
    hero: {
      eyebrow: "Pricing",
      title: "Transparent pricing, no hidden lines",
      lede: "Simple plans for individuals, per-user pricing for teams. Lio is included in every plan; top up with credits when you use it heavily.",
    },
    tabs: { personal: "Individual", business: "Business" },
    personal: [
      {
        name: "Starter",
        desc: "For solo workers and anyone who wants to try Projelio.",
        priceMonthly: 0,
        priceYearly: 0,
        priceLabel: "Free",
        note: "Free forever",
        cta: "Get started",
        featured: false,
        perUser: false,
        features: [
          "1 user",
          "3 active projects",
          "Unlimited tasks and calendar",
          "100 Lio credits per month",
          "Mobile app",
          "Email support",
        ],
      },
      {
        name: "Pro",
        desc: "The full version for freelancers and one-person businesses.",
        priceMonthly: 249,
        priceYearly: 2490,
        priceLabel: "",
        note: "2 months free on annual billing",
        cta: "Start 14-day trial",
        featured: true,
        perUser: false,
        features: [
          "1 user",
          "Unlimited projects",
          "2,000 Lio credits per month",
          "Lio over WhatsApp",
          "Income/expense and project budgets",
          "Customer (CRM) module",
          "Google Drive connection",
          "Priority support",
        ],
      },
      {
        name: "Studio",
        desc: "For small studios and teams of up to 5 people.",
        priceMonthly: 549,
        priceYearly: 5490,
        priceLabel: "",
        note: "Up to 5 users included",
        cta: "Start 14-day trial",
        featured: false,
        perUser: false,
        features: [
          "Up to 5 users",
          "Everything in Pro",
          "6,000 Lio credits per month",
          "Department-level permissions",
          "3 additional modules",
          "Team calendar and utilisation report",
        ],
      },
    ],
    business: [
      {
        name: "Team",
        desc: "Per-user pricing for growing teams.",
        priceMonthly: 189,
        priceYearly: 1890,
        priceLabel: "",
        note: "Minimum 3 users",
        cta: "Start 14-day trial",
        featured: false,
        perUser: true,
        features: [
          "Unlimited projects and tasks",
          "1,500 Lio credits per user",
          "Up to 10 modules",
          "Role and department permissions",
          "Excel/CSV export",
          "Lio over WhatsApp",
        ],
      },
      {
        name: "Business",
        desc: "For departmental structures and multi-project companies.",
        priceMonthly: 349,
        priceYearly: 3490,
        priceLabel: "",
        note: "Minimum 5 users",
        cta: "Talk to sales",
        featured: true,
        perUser: true,
        features: [
          "Everything in Team",
          "Unlimited modules",
          "4,000 Lio credits per user",
          "Approval flows and business rules",
          "API access and webhooks",
          "Single sign-on (SSO)",
          "Dedicated onboarding and training",
        ],
      },
      {
        name: "Enterprise",
        desc: "50+ users, custom integrations and a contractual service level.",
        priceMonthly: -1,
        priceYearly: -1,
        priceLabel: "Custom quote",
        note: "SLA and custom agreement",
        cta: "Get a quote",
        featured: false,
        perUser: false,
        features: [
          "Everything in Business",
          "Service level agreement (SLA)",
          "Custom integration development",
          "Dedicated infrastructure option",
          "Named customer manager",
          "On-site training",
        ],
      },
    ],
    addons: {
      title: "Included in every plan",
      items: [
        "Unlimited tasks, files and comments",
        "iOS and Android apps",
        "Turkish and English interface",
        "Daily backups",
        "Compliant data processing",
        "No setup fee",
      ],
    },
    faqTitle: "Pricing questions",
    compareTitle: "Plan comparison",
  },

  credits: {
    hero: {
      eyebrow: "Lio credits",
      title: "Pay for as much Lio as you actually use",
      lede: "Your plan comes with credits that renew every month. If a busy month runs them out, top up once and keep going. Purchased credits never expire.",
    },
    packsTitle: "Credit packs",
    packsLede: "The bigger the pack, the lower the unit price. Write to us for enterprise volumes.",
    packs: [
      { credits: 1000, price: 99, bonus: 0 },
      { credits: 5000, price: 449, bonus: 500 },
      { credits: 15000, price: 1199, bonus: 2500 },
      { credits: 50000, price: 3499, bonus: 12500 },
    ],
    bonusLabel: "bonus credits",
    unitLabel: "per 1,000 credits",
    selected: "Selected",
    select: "Select",
    buy: "Top up credits",
    totalCredits: "Total credits",
    calcTitle: "How many credits do I need?",
    calcLede: "Set your team size and daily Lio usage to see a monthly estimate.",
    calcUsers: "People using Lio",
    calcPerDay: "Actions per person per day",
    calcResult: "Estimated monthly credits",
    calcSuggestion: "Suggested pack",
    calcNote: "Calculated over 22 working days. The monthly credits in your plan are deducted from this amount.",
    usageTitle: "Credit consumption table",
    usageLede: "We list all of it for transparency. Anything you do in the panel costs nothing — only Lio spends credits.",
    usageHead: ["Action", "Credits"],
    usage: [
      ["Simple question (\"what's on today?\")", "1"],
      ["Creating or closing a task", "1"],
      ["Customer or project summary", "3"],
      ["Weekly executive report", "8"],
      ["Reading and summarising a document (per page)", "4"],
      ["Generating a proposal draft", "12"],
      ["Monthly financial analysis", "20"],
      ["Everything done in the panel", "0"],
    ],
    faqTitle: "Questions about credits",
    faq: [
      { q: "Do credits reset every month?", a: "The monthly credits included in your plan renew each billing period and don't roll over. Credits you purchase separately never expire and stay in your account." },
      { q: "Which credits get used first?", a: "Your plan's monthly credits are used first; purchased credits are only touched afterwards, so nothing you bought goes to waste." },
      { q: "What happens if I run out?", a: "All of Projelio keeps working — only Lio stops taking new requests and lets you know. You carry on from the panel exactly where you left off." },
      { q: "Are credits refundable?", a: "You can request a refund for unused credit packs within 14 days of purchase. Details are on our Cancellation and Refund page." },
      { q: "Do team members share one pool?", a: "Yes. Credits belong to the company account. You can optionally set monthly limits per user or per department." },
    ],
  },

  faq: {
    hero: {
      eyebrow: "Frequently asked questions",
      title: "Good questions, straight answers",
      lede: "If you can't find what you're after, write to us from the contact page — we usually reply the same day.",
    },
    categories: [
      {
        name: "General",
        items: [
          { q: "What exactly is Projelio?", a: "Projelio is a business management platform that brings project and task management, calendar, income/expense tracking, customer management and department modules into a single panel. What sets it apart is Lio, an AI assistant that works on top of your company data: instead of you chasing the work, Lio tracks it and you decide." },
          { q: "Who is it for?", a: "Anyone from freelancers to 200-person companies. The profiles that benefit most: construction and contracting firms, agencies, production workshops, engineering offices and service companies with field teams." },
          { q: "How long does setup take?", a: "Creating an account and your first project takes about 2 minutes. Pick an industry template and your workflow and departments arrive pre-built. Team invitations and the WhatsApp connection take under 10 minutes." },
          { q: "Can I migrate my existing data?", a: "Yes. Excel/CSV import is available on all plans. We offer free migration support from Trello, Jira, monday and Asana — on Business and Enterprise plans we do the migration for you." },
          { q: "Is there a mobile app?", a: "Projelio is available for iOS and Android. You can add notes and photos in the field without connectivity, and everything syncs once you're back online." },
          { q: "Which languages are supported?", a: "The interface is available in Turkish and English. Lio currently understands Turkish and English; other languages are on the roadmap." },
        ],
      },
      {
        name: "Lio and AI",
        items: [
          { q: "How does Lio work on WhatsApp?", a: "You send the 6-digit pairing code from your panel to Lio on WhatsApp and your account is linked. Lio only replies when you write to it — it never messages you unprompted. If you want automatic reports, you enable that yourself in settings." },
          { q: "What if Lio does the wrong thing?", a: "For hard-to-undo actions such as deletions, payments or bulk changes, Lio asks for confirmation first. Every action it takes appears in the panel labelled \"by Lio\" and can be reverted in one click." },
          { q: "Does Lio learn from my data?", a: "No. Your content is never used to train AI models. Lio accesses only the data needed to answer the request at hand, and can never show information the user isn't allowed to see in the panel." },
          { q: "Can I use Projelio without Lio?", a: "Absolutely. Projelio is a complete project management platform on its own. You can turn Lio off entirely or enable it for specific users only." },
          { q: "Can I send voice messages?", a: "Yes — Lio transcribes WhatsApp voice notes and acts on them. It's one of the most-used features among field teams." },
        ],
      },
      {
        name: "Pricing and payment",
        items: [
          { q: "How does the free trial work?", a: "You get every Pro feature for 14 days without entering card details. Nothing is charged automatically at the end: choose a plan to continue, or your account simply drops to the Starter plan." },
          { q: "Which payment methods do you accept?", a: "Credit and debit cards online, bank transfer, and contractual invoiced billing for corporate customers. Payments run through a licensed payment provider; card details are never stored on our servers." },
          { q: "Do you issue invoices?", a: "Yes, an e-invoice is issued for every payment. Enter your company details in the panel and invoices arrive in your inbox automatically." },
          { q: "Can I change my plan later?", a: "Upgrade or downgrade whenever you like. Upgrades are prorated for the remaining days; downgrades are credited to the next period." },
          { q: "What's the advantage of annual billing?", a: "You pay for 10 months instead of 12 — two months free. You're also shielded from price increases for the year." },
          { q: "Is cancelling difficult?", a: "No. You cancel with one click in the panel — no phone calls, no forms. You keep access until the end of the current period." },
        ],
      },
      {
        name: "Security and data",
        items: [
          { q: "Where is my data stored?", a: "Data is stored on servers in the EU/Türkiye region, encrypted at disk level. All connections are TLS encrypted and backups are taken daily." },
          { q: "Are you compliant with data regulations?", a: "Yes. Privacy notice, consent flow, data processor agreement and the data subject request process are all in place. We also sign data processing agreements with corporate customers." },
          { q: "Can team members see everything?", a: "No. Permissions are defined at department and module level. A field team can see only their own tasks while the finance module stays limited to accounting, for example." },
          { q: "What happens to my data if I delete my account?", a: "After a closure request your data is retained for 30 days (in case you change your mind), then permanently deleted. You can export everything as Excel/CSV beforehand." },
        ],
      },
    ],
  },

  contact: {
    hero: {
      eyebrow: "Contact",
      title: "Let's talk",
      lede: "Demo, quote, integration or plain curiosity — whatever it is, write to us. On weekdays we usually reply the same day.",
    },
    formTitle: "Leave a message",
    fields: {
      name: "Full name",
      email: "Email",
      company: "Company",
      phone: "Phone",
      subject: "Subject",
      message: "Your message",
      submit: "Send message",
      sending: "Sending…",
      kvkk: "I accept the processing of my personal data as described in the Privacy Notice.",
    },
    subjects: ["Demo request", "Pricing and quotes", "Technical support", "Integration / API", "Partnership", "Other"],
    success: "Your message reached us. We'll get back to you shortly.",
    error: "The message couldn't be sent. Please try again or email us directly.",
    infoTitle: "Reach us directly",
    channels: [
      { label: "Email", value: "info@projelio.app", href: "mailto:info@projelio.app" },
      { label: "WhatsApp", value: "Message Lio", href: "" },
      { label: "Support hours", value: "Weekdays 09:00 – 18:00 (GMT+3)", href: "" },
    ],
    demoTitle: "Request a live demo",
    demoText: "In a 30-minute screen share we'll walk through Projelio using your own workflow. Free, and no sales pressure.",
  },

  footer: {
    about:
      "Projelio is a business management platform built for how teams actually work. Lio, the AI assistant, keeps track of the work for you.",
    productTitle: "Product",
    companyTitle: "Company",
    legalTitle: "Legal",
    rights: "All rights reserved.",
    madeIn: "Designed and built in Türkiye.",
  },

  legal: {
    privacy: {
      title: "Privacy Policy",
      lede: "What data we collect, why we collect it and how we protect it — in plain language.",
    },
    terms: {
      title: "User Agreement",
      lede: "The rights and obligations that apply to you and to us when you use Projelio.",
    },
    kvkk: {
      title: "Privacy Notice (KVKK)",
      lede: "Our disclosure as data controller under Turkish Personal Data Protection Law no. 6698.",
    },
    distance: {
      title: "Distance Sales Agreement",
      lede: "The agreement that applies to online subscription and credit purchases.",
    },
    refund: {
      title: "Cancellation and Refund Policy",
      lede: "When and how you can cancel your subscription or get a refund on credits.",
    },
    placeholder:
      "This text is a draft and must be reviewed by a lawyer and adapted to your company details before going live.",
  },

  notFound: {
    title: "Page not found",
    lede: "The page you're looking for may have moved, or may never have existed.",
  },
};
