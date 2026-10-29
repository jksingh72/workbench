---
id: package-analysis
category: analysis
name: Deep Software Package Learning & Analysis Guide
description: Connected 14-part learning guide explaining what a software package does, how its pieces fit together, how execution works, and how to use it effectively.
whenToUse: Load this prompt ONLY when the user asks to analyze, deeply understand, or explain a software package, library, framework, SDK, or utility.
targetActions:
  - load_prompt
  - fetch_official_docs
---

Help me deeply understand this software package:

PACKAGE: [PACKAGE NAME]

Create a clear, connected learning guide that explains what this package does, how its pieces fit together, how execution works, and how to use it effectively.

Assume I know basic programming but am new to this package. Identify the package’s nature yourself—library, framework, SDK, utility, or another kind of software. Do not ask me to classify it or supply a package-specific learning outline.

If the name is genuinely ambiguous, ask one focused clarification question. Otherwise, proceed.

RESEARCH AND ACCURACY

- Prefer official documentation, official API references, and the official repository.
- Establish which version you are explaining when possible. Do not mix incompatible versions or similarly named products.
- If you cannot access current sources, state that limitation briefly. Do not claim to have verified the latest version.
- Cite sources for substantive technical claims when source access is available.
- Distinguish documented behavior, simplified teaching models, recommendations, and uncertain details.
- Do not invent APIs, parameters, defaults, outputs, benchmarks, or internal behavior.
- Clearly label code as executed and verified, based on documentation but not executed, or pseudocode.
- Distinguish public API guarantees from implementation details.
- Keep installation and package metadata brief unless they are essential to understanding or using the package.

HOW TO BUILD THE EXPLANATION

Use the coverage framework below as an internal checklist—not as a fixed table of contents.

Do not mechanically copy its headings, numbering, or question lists into the response.

Instead:
- Create descriptive headings suited to the actual package and its important concepts.
- Organize the explanation in the order that best supports understanding.
- Combine related topics and split complex topics where helpful.
- Answer the guiding questions naturally rather than repeating them as a questionnaire.
- Omit inapplicable topics instead of creating empty sections.
- Preserve all relevant coverage even when changing the presentation.
- Introduce the big picture before detailed APIs.
- Define unfamiliar terms when first used.
- Explain relationships and responsibilities, not just definitions.
- Use one running example across the guide wherever practical.
- Use tables for comparisons and diagrams for relationships or execution flow.
- Avoid repetition, exhaustive API dumps, and unnecessary jargon.
- Keep simple packages simple and give complex packages sufficient depth.

The result should read like a purpose-built learning guide, not a filled-in generic template.

COVERAGE FRAMEWORK

1. PURPOSE, SCOPE, AND RESPONSIBILITIES

Explain:
- What the package is.
- What problem it solves.
- What I can build or accomplish with it.
- Where it fits in a larger program or technology stack.
- What it handles for me.
- What remains my responsibility.
- When it is useful and when I might not need it.
- Which related technologies or similarly named products I should not confuse it with.

Begin with a short plain-language explanation that gives me a useful orientation.

2. CORE MENTAL MODEL

Explain the smallest set of ideas needed to understand the package:
- What are the main things I work with?
- What do I create, provide, or configure?
- What operations occur?
- Who controls execution: my code, the package, or both?
- What comes out, changes, or persists?

Include:
- A concise mental model.
- A simple ASCII diagram of the major components and relationships.
- A clear distinction between my code’s responsibilities and the package’s responsibilities.

Do not force a request/response, pipeline, agent, session, or event-loop model onto a package unless it genuinely applies.

If you use an analogy, explain its limits.

3. ESSENTIAL CONCEPTS AND BUILDING BLOCKS

Identify the concepts needed to understand and use the package.

Distinguish:
- Must understand first.
- Needed for everyday use.
- Advanced or optional.

For each essential concept, explain:
- What it is.
- Why it exists.
- Whether it is a conceptual idea, runtime component, data structure, or concrete API.
- How it connects to other concepts.
- Which public APIs represent it.
- When I would use it.
- A small example or concrete illustration.
- A common misunderstanding.

Do not present an isolated glossary. Show how the concepts work together.

4. ONE REPRESENTATIVE END-TO-END EXECUTION

Choose a small but meaningful operation and trace it from beginning to end.

Explain:
- What starts it.
- What inputs are supplied.
- What preparation occurs.
- Which components participate.
- What determines the sequence of steps.
- Where my code runs.
- How data moves or changes.
- Whether external systems participate.
- What result, event, or side effect occurs.
- How execution finishes, continues, or cleans up.
- What happens if an important step fails.

Use a numbered sequence or ASCII diagram.

At important steps, identify:
- Who performs the step: my code, the package, or an external system.
- What enters and leaves.
- What state changes, if any.

Clearly distinguish a conceptual trace from a verified internal call sequence.

5. A MINIMAL, MEANINGFUL WORKING EXAMPLE

Provide:
- The example’s goal.
- Required installation and environment setup.
- Relevant version assumptions.
- Necessary imports.
- Complete code.
- How to run it.
- Expected behavior or output.
- Explanation of important lines.
- A mapping between the code and the mental model.
- Whether the code was actually executed.

State required credentials, external services, files, or other prerequisites. Do not hardcode secrets or hide important setup behind unexplained placeholders.

If a standalone runnable example is not realistic, explain why and provide the smallest honest example possible.

6. THE ESSENTIAL PUBLIC API

Select APIs needed for basic competence and the running example—not the entire API surface.

Explain:
- Starting points.
- Configuration APIs.
- Main operations.
- Data and result objects.
- Customization points, where applicable.
- APIs I can postpone learning.

Where useful, use a table containing:
- API name and kind.
- Purpose.
- Important inputs.
- Output and type.
- Side effects or state changes.
- When to use it.

Include defaults, exceptions, and behavioral constraints only when relevant and verified.

7. COMMON TASKS AND CAPABILITIES

Choose 3–5 representative tasks, scaled to the package’s complexity.

For each task, identify:
- What I am trying to accomplish.
- Concepts required.
- APIs involved.
- A small experiment or concise example.
- Expected behavior.
- Evidence that it worked.
- Common mistakes or failure cases.

Order tasks from basic to more realistic. Build on earlier examples instead of repeatedly starting from scratch.

8. DATA, CONFIGURATION, STATE, AND LIFECYCLE

Cover whichever topics meaningfully apply:
- Input and output types, formats, shapes, or schemas.
- Validation and conversion.
- Mutable versus immutable behavior.
- Configuration options, scope, and precedence.
- State ownership and persistence.
- Initialization and shutdown.
- Resource ownership and cleanup.
- Reuse across operations.
- Sync and async behavior.
- Concurrency and thread-safety.
- Blocking operations.
- Cancellation, timeouts, and execution limits.

Do not assume the package has network access, persistent state, background execution, sessions, or managed resources.

9. CUSTOMIZATION AND INTEGRATION

Explain:
- How the package connects to the rest of my code.
- How I supply custom behavior, if supported.
- Contracts or interfaces my code must satisfy.
- Supported extension points.
- Relevant integrations.
- Which internal details should not be relied on.

Provide a small customization example if customization is important to ordinary usage. Otherwise, keep this brief.

10. FAILURES, DEBUGGING, AND TESTING

Explain:
- Common categories of failure.
- Where and how errors appear.
- How to inspect intermediate behavior or results.
- How to test code using the package.
- How to distinguish my mistakes from package problems or external-system failures.

Where helpful, use:
| Symptom | Likely causes | How to investigate | Possible correction |

Discuss logging, tracing, retries, mocking, and observability only when relevant.

Flag situations where retrying could duplicate side effects. Distinguish documented behavior from troubleshooting advice.

11. LIMITATIONS AND TRADEOFFS

Explain relevant boundaries:
- What the package does not handle.
- Important assumptions.
- Architectural constraints.
- Performance and resource considerations.
- Security and privacy boundaries.
- Credentials and permissions.
- External dependencies and operating costs.
- Compatibility constraints.
- Situations where a simpler or different approach may be preferable.

Avoid unsupported performance claims, generic warnings, and unnecessary comparisons.

12. INTERNAL ARCHITECTURE, ONLY WHEN USEFUL

After explaining the public model, include internal details only if they materially improve understanding:
- Major components or modules.
- How they collaborate.
- How the public API connects to them.
- Version-sensitive implementation details.
- Useful entry points for reading the source.

Keep optional internals clearly separate from knowledge required for everyday use. Do not infer exact internals without evidence.

13. PRACTICE AND UNDERSTANDING CHECKS

Provide a short progression of exercises:
- Reproduce the minimal example.
- Predict the result of a small change.
- Make that change and inspect the result.
- Add a useful capability.
- Trigger and diagnose a controlled failure.
- Apply the package to a small independent task.

For each exercise, state what it teaches and what success looks like.

Include questions that test whether I can explain:
- The mental model.
- Relationships between building blocks.
- Execution flow.
- Responsibility boundaries.
- State ownership, where applicable.
- Why a particular API is appropriate.
- A likely failure and how to investigate it.

Place concise answer guidance after the questions so I can attempt them first.

14. FINAL SYNTHESIS

End with:
- The five most important things to remember.
- A compact map connecting the core concepts.
- What to learn first, next, and later.
- Common misconceptions to avoid.
- Unresolved questions or version-sensitive details.
- The most relevant official documentation links, when available.

FINAL QUALITY CHECK

Before responding, check:
- Does this teach how the package works, rather than merely describe its features?
- Are concepts connected to execution and code?
- Are my responsibilities clearly separated from the package’s?
- Is the presentation adapted to this particular package?
- Are all relevant framework topics covered without forcing irrelevant ones?
- Are claims and examples appropriately verified or qualified?
- Could I use this guide to explain the package, run a small example, modify it intentionally, and investigate a basic failure?

