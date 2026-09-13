/**
 * Study-material fixtures for the AI evals.
 *
 * These stand in for a student's uploaded notes. Each one is written so that
 * specific claims are checkable: a fact stated once and only once, a table with
 * known columns, a formula, a definition list. That lets an assertion say
 * "the answer must be supported by the source" rather than "the answer looks
 * plausible", which is the difference between an eval and a vibe check.
 *
 * Kept deliberately small. Evals cost real tokens, and a fixture that takes
 * 40 seconds to process is a fixture nobody runs.
 */

export interface EvalFixture {
  id: string;
  /** What a human would call this material. */
  title: string;
  /** The note text as the app would hold it in `extracted_text`. */
  content: string;
  /**
   * Facts stated exactly once in `content`. A grounded question about any of
   * these must produce an answer containing the paired term.
   */
  groundTruth: { question: string; mustContain: string[] }[];
  /** Terms that appear nowhere in the material. An answer citing one is invented. */
  absentTerms: string[];
}

export const STAKEHOLDER_FIXTURE: EvalFixture = {
  id: 'stakeholders',
  title: 'Managing Project Stakeholders',
  content: `## Stakeholder Analysis

**Stakeholder**: any person or group with an interest in the outcome of the project.

Influence is rated on a scale from 0 to 10, where 0 means no influence and 10 means the person can terminate the project. Interest is rated from -1 (opposed) to +1 (supportive).

| Stakeholder | Role | Interest | Influence | Strategy |
| --- | --- | --- | --- | --- |
| Hirem N. Firem | Project Sponsor | +1 | 5 | Maintain open communication |
| Dee Manitger | Project Manager | +1 | 3 | Work closely with the sponsor |
| I. Will Sellit | Marketing Manager | -1 | 4 | Build the best possible relationship |

## Communication Planning

The communications plan states who receives which information, in what format, and how often. A project with 6 stakeholders has 15 possible communication channels, calculated as n(n-1)/2.

**Escalation**: raising an unresolved issue to a higher level of authority.

The project sponsor signs off the final deliverable. The steering committee meets fortnightly.`,
  groundTruth: [
    { question: 'What is the highest value on the influence scale?', mustContain: ['10'] },
    { question: 'How many communication channels does a project with 6 stakeholders have?', mustContain: ['15'] },
    { question: 'Who signs off the final deliverable?', mustContain: ['sponsor'] },
    { question: 'How often does the steering committee meet?', mustContain: ['fortnight'] },
  ],
  // Plausible project-management terms this material never mentions.
  absentTerms: ['Gantt chart', 'critical path', 'burndown', 'Scrum master'],
};

export const KINETICS_FIXTURE: EvalFixture = {
  id: 'kinetics',
  title: 'Reaction Kinetics',
  content: `## Rate of Reaction

**Rate of reaction**: the change in concentration of a reactant or product per unit time.

The rate law for a reaction is written as rate = k[A]^m[B]^n, where k is the rate constant and m and n are the reaction orders.

## Reaction Order

A zero-order reaction proceeds at a constant rate regardless of concentration. Its half-life is given by t = [A]0 / (2k).

A first-order reaction has a half-life of t = 0.693 / k, which does not depend on starting concentration.

A second-order reaction has a half-life of t = 1 / (k[A]0), so it doubles each time the concentration halves.

## Activation Energy

**Activation energy**: the minimum energy that colliding particles must have for a reaction to occur.

The Arrhenius equation relates the rate constant to temperature: k = A * exp(-Ea / (R * T)).

Raising the temperature by 10 degrees Celsius roughly doubles the rate for many reactions.`,
  groundTruth: [
    { question: 'What is the half-life of a first-order reaction?', mustContain: ['0.693'] },
    { question: 'Which reaction order has a half-life independent of starting concentration?', mustContain: ['first'] },
    { question: 'What does raising the temperature by 10 degrees do to the rate?', mustContain: ['double'] },
  ],
  absentTerms: ['catalyst poisoning', 'Le Chatelier', 'enthalpy of formation'],
};

export const ALL_FIXTURES: EvalFixture[] = [STAKEHOLDER_FIXTURE, KINETICS_FIXTURE];
