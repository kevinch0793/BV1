import type { ResumeContent } from "@/lib/llm/schema";

// Representative content so every template feature shows in a style preview.
export const SAMPLE_RESUME: ResumeContent = {
  name: "Alex Rivera",
  title: "Software Engineer",
  contact: {
    email: "alex.rivera@email.com",
    phone: "(555) 123-4567",
    location: "Remote",
    links: [
      { label: "github.com/alexr", url: "https://github.com/alexr" },
      { label: "linkedin.com/in/alexr", url: "https://linkedin.com/in/alexr" },
    ],
  },
  summary:
    "Software Engineer with 6 years building reliable backend services and ML-backed features in Agile teams, shipping to production with AI dev tools like Claude Code and GitHub Copilot CLI. Focused on distributed systems, clean APIs, and measurable impact.",
  skills: [
    { category: "Languages", items: ["Go", "Python", "TypeScript", "SQL"] },
    { category: "Infrastructure", items: ["Kubernetes", "AWS", "Terraform", "Kafka"] },
    { category: "Practices & Tools", items: ["Agile", "CI/CD", "Claude Code", "GitHub Copilot CLI"] },
  ],
  experience: [
    {
      company: "Northwind Labs",
      role: "Senior Software Engineer",
      location: "Remote",
      startDate: "Jan 2022",
      endDate: "Present",
      projects: [
        {
          name: "Payments Platform",
          type: "Distributed services",
          bullets: [
            "Led a 4-engineer team rebuilding the payments pipeline, cutting p99 latency 38% while handling 12K req/s.",
            "Designed idempotent transaction APIs adopted by 7 downstream teams.",
            "Used Claude Code and Copilot CLI to accelerate code review and refactors across the service.",
            "Introduced contract tests in CI, reducing integration regressions to near zero.",
          ],
        },
      ],
    },
    {
      company: "Brightseed",
      role: "Software Engineer",
      location: "Austin, TX",
      startDate: "Jun 2019",
      endDate: "Dec 2021",
      projects: [
        {
          name: "",
          type: "",
          bullets: [
            "Built a feature store powering 3 ML models, improving inference freshness from hours to minutes.",
            "Collaborated in an Agile team to ship a customer dashboard used by 20K monthly users.",
            "Owned on-call for core APIs, raising uptime to 99.95%.",
          ],
        },
      ],
    },
  ],
  education: [
    {
      school: "University of Texas at Austin",
      degree: "B.S.",
      field: "Computer Science",
      startDate: "2015",
      endDate: "2019",
      details: "GPA 3.8",
    },
  ],
};
