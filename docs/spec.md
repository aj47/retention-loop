# Retention Loop — AI Director

## Product & Technical Specification

**Version:** 3.0  
**Date:** October 25, 2026  
**Status:** Implementation proposal  
**Product category:** AI-native creative direction, video improvement, and channel intelligence

---

# 1. Product Vision

Retention Loop is an AI Director for YouTube creators.

It learns from everything a creator has published and uses that knowledge to help them develop ideas, improve scripts, edit videos, understand audience behavior, and produce better content over time.

Unlike traditional creator analytics tools, Retention Loop doesn't primarily present information for the creator to interpret.

**It proposes tangible creative improvements that creators can immediately inspect, compare, modify, and use.**

The central product promise:

> **Your next video should know what your last 50 learned.**

### 1.1 The fundamental interaction

A creator provides whatever they're currently working on:

- A rough idea
- A topic they want to explore
- A draft script
- A storyboard
- A rough-cut video
- A previously published video

Retention Loop understands the material, retrieves relevant lessons from the creator's channel, and presents actionable alternatives.

The creator can see what changed, understand why, and choose which changes to keep.

### 1.2 What makes the product different

Retention Loop combines four capabilities:

**Creative direction**

Generates interesting topics, angles, hooks, narrative structures, and editorial approaches.

**Creative transformation**

Doesn't simply critique existing work. It produces alternative scripts, shot plans, and, when technically feasible, playable video edits.

**Channel intelligence**

Remembers historical performance, successful patterns, failures, audience expectations, and previous experiments.

**Continuous learning**

Uses actual post-publication outcomes and creator feedback to improve subsequent recommendations.

These capabilities operate within one continuous creative experience rather than four disconnected tools.

### 1.3 Core principles

1. **Start anywhere.** Never require a creator to follow a predefined production workflow.
2. **Show, don't tell.** Present an alternative script or edit instead of only describing a problem.
3. **Decisions before analytics.** Surface the proposed improvement first; make supporting evidence available on demand.
4. **Minimal friction.** Avoid unnecessary forms, configuration screens, and repeated input.
5. **One persistent creative context.** Remember the idea, scripts, footage, revisions, decisions, and outcomes associated with a project.
6. **Channel knowledge is guidance, not a constraint.** Preserve the creator's originality and willingness to experiment.
7. **Changes must be inspectable and reversible.** The creator retains editorial control.
8. **Be honest about uncertainty.** Historical associations are not proof of what will work.
9. **Learn from successes and failures.** Identify both successful moments and weaknesses.
10. **Make the output usable.** A recommendation should produce something the creator can directly use or implement.

---

# 2. The Core Product Experience

## 2.1 One AI Director, multiple starting points

The application should have one primary interface.

The creator does not need to decide which analytical subsystem or AI agent to run.

The system identifies the input and adapts its capabilities.

| Input | Primary experience | Main output |
|---|---|---|
| Idea | Explore creative directions | Angles, hooks, outlines, briefs |
| Script | Improve and compare | Alternative drafts, rewrites, shot plans |
| Rough cut | Improve the actual footage | Proposed recuts, previews, edit instructions |
| Published video | Learn and optimize | Evidence-backed findings, new cuts, experiments |
| Channel history | Discover opportunities | Lessons, future topics, back-catalog recommendations |

The product supports transitions between these inputs without requiring creators to start over.

For example:

Idea → Script → Rough Cut → Published Video → Lessons → Next Idea

This is the natural lifecycle, but it is not a mandatory wizard.

## 2.2 Primary interaction modes

Three capabilities should remain consistent throughout the application.

**Explore**

Discover possibilities.

Examples:

- Find a stronger angle
- Suggest three different hooks
- Generate unexpected video concepts
- Explore alternative structures
- Discover topics worth revisiting

**Improve**

Transform an existing artifact.

Examples:

- Rewrite a script
- Shorten an introduction
- Improve payoff timing
- Reorder a sequence
- Prepare an alternative cut

**Compare**

Evaluate alternatives.

Examples:

- Original script versus rewrite
- Three different openings
- Original video versus proposed recut
- Two narrative structures
- Experimental results from alternative edits

These should be available contextually, not necessarily as three permanent navigation pages.

---

# 3. Information Architecture

## 3.1 Primary navigation

Keep global navigation deliberately small.

**Director**

The main entry point. Start new work, continue existing projects, or act on a recommendation.

**My Work**

Ideas, scripts, video projects, and previously analyzed videos. A unified library with filtering by type, stage, and status.

**Opportunities**

Proactive suggestions from the channel's history, including upcoming topics, older videos worth revisiting, and worthwhile experiments.

**Channel Memory**

Persistent lessons and historical evidence. Primarily an advanced exploration area, rather than the default experience.

**Settings**

Channel connections, permissions, preferences, integrations, and account management.

Experiments and analytics should primarily live within their associated projects, with optional filtering and consolidated views.

## 3.2 Primary object: Creative Project

A project is the persistent container for a creator's work.

It can contain:

- Initial idea and creative intent
- Working title and target audience
- Scripts and script versions
- Narrative structure and shot plans
- Source footage and rough cuts
- Generated edits and variations
- Published YouTube video references
- Analytics and audience observations
- Recommendations and experiments
- Creator feedback
- Lessons learned

A project does not require all these fields to exist.

It can begin as a single sentence or an uploaded video.

The system should progressively attach artifacts to the same project as the work evolves.

## 3.3 Interface hierarchy

The default interface should prioritize:

1. What the creator is working on
2. What the AI proposes
3. What changed between alternatives
4. What the creator can do next
5. Why the AI made its suggestion
6. The underlying analytics and detailed evidence

The first four should typically be visible without requiring navigation into another section.

---

# 4. Screen 1 — Start Anywhere

## 4.1 Purpose

Deliver value with minimal setup.

This screen is the default entry point for both new and returning users.

### Primary UI

A spacious central composer with the prompt:

**What are we making better today?**

Supporting text:

*Bring an idea, script, rough cut, or published video. We'll pick up where you are.*

The composer supports:

- Plain-text input
- Pasted scripts
- File upload
- Drag-and-drop media
- Authorized YouTube video selection
- YouTube URL identification, subject to permissions and accessible data

Example creator inputs:

- "I want to compare Gemini CLI and Codex."
- "Make the first minute of this script more interesting."
- "Find a better opening for this video."
- "What should I make next?"

### Input behavior

The system attempts to detect whether the input represents an idea, script, video, or published content.

Show small optional input-type controls where useful, but do not require creators to classify their material manually.

For ambiguous input, show a proposed interpretation that can be changed.

### Supporting content

Below the composer, show at most two or three contextual suggestions.

Examples:

**Worth revisiting**

Your older AI agents tutorial might benefit from a stronger opening.

**Potential next video**

Your comparison videos have performed well. Here's an angle you haven't explored.

**Continue working**

Gemini CLI vs Codex — Script V3

Suggestions should be actionable rather than informational.

### First-time onboarding

A creator should be able to paste an idea or script before connecting YouTube.

Without a connected channel, the system offers general creative assistance and explicitly marks it as unpersonalized.

Channel connection is requested contextually when the user wants historical personalization or published-video analysis.

Do not make OAuth a prerequisite to experiencing basic creative value.

### Success condition

The creator can reach a useful creative output after one initial submission, without configuring an analysis workflow.

---

# 5. Screen 2 — Find the Angle

## 5.1 Purpose

Turn an idea into several meaningfully different creative directions.

### Example input

"I want to compare two AI coding agents on a real-world task."

### Primary UI

Show three distinct editorial treatments.

**Direction A — The Real-World Showdown**

Same task, two agents, one winner.

**Direction B — The Surprise Failure**

What went wrong when nobody checked?

**Direction C — The Practical Decision Guide**

Which agent should developers actually use?

Each direction includes:

- Concept title
- One-sentence premise
- Intended viewer
- Central promise
- Suggested opening
- Narrative approach
- Why this approach may be interesting
- Relevant historical lessons, where available

### Interaction model

Selecting a direction expands it into an editable creative brief.

The creator can:

- Select a direction
- Combine elements from multiple directions
- Request more original or unconventional options
- Add constraints
- Change tone or intended audience
- Generate an outline
- Start a script

Avoid forcing the creator to choose exactly one AI-generated option.

The creator's original idea remains editable.

### Channel memory integration

Display a compact contextual note such as:

"Comparison videos have historically performed well among similar uploads on your channel."

Offer a **Why this direction?** action to inspect supporting examples.

Do not show detailed charts by default.

### Originality requirement

The system must deliberately offer exploration outside established patterns.

Possible controls:

- More original
- More practical
- More entertaining
- More technical
- More surprising

Recommendations should not exclusively optimize toward previous successful formats.

### Output

An editable creative brief that persists with the project and can be converted into a script or shot plan.

---

# 6. Screen 3 — Rewrite Together

## 6.1 Purpose

Make script improvement collaborative, inspectable, and immediately useful.

The creator should feel that the AI is actively editing with them rather than issuing a critique.

## 6.2 Primary UI

A script comparison workspace.

**Original**

The creator's current script.

**Director's Alternative**

A proposed revision.

At the top, allow switching between creative treatments:

- Payoff first
- Curiosity-driven
- Challenge-driven
- More concise
- Custom direction

Changes should be clearly highlighted.

### Example

Original:

"Today we're going to look at two different AI coding tools. First, let me explain how they work and how I've configured each one..."

Alternative:

"I gave Gemini CLI and Codex the exact same coding task. One finished in eight minutes. The other made a mistake I almost shipped."

The AI should explain the specific editorial purpose of the change.

For example:

"Moves the central comparison into the opening and delays technical setup until after the viewer understands the challenge."

## 6.3 Editing interactions

Support:

- Accept entire alternative
- Accept a selected section
- Reject a change
- Edit either version
- Request another variation
- Preserve a selected passage
- Merge alternatives
- Undo and restore revisions
- Compare versions
- Export the selected script

Use inline editing rather than forcing creators to copy material between external tools.

### Contextual AI actions

On selected text:

- Make tighter
- Make more compelling
- Simplify
- Increase suspense
- Improve transition
- Show the result sooner
- Preserve my tone
- Generate alternatives

The AI should respect explicit locked or preserved passages.

## 6.4 Structural intelligence

In addition to sentence-level improvements, the system analyzes:

- Hook clarity
- Viewer promise
- Setup length
- Narrative progression
- Question and payoff structure
- Repetition
- Information density
- Demonstration timing
- Transitions
- Ending and resolution

A structural timeline may appear as an optional view.

Example:

Hook → Setup → Challenge → Demo → Comparison → Payoff

Creators can rearrange narrative beats and regenerate transitions.

## 6.5 Contextual evidence

Display small, nonintrusive references to applicable channel lessons.

Example:

"Relevant channel lesson: showing a hands-on result early has coincided with stronger opening retention in several comparable tutorials."

Clicking the lesson reveals:

- Supporting videos
- Relevant timestamps
- Contradictory examples
- Strength and limitations of the evidence

## 6.6 Additional outputs

The approved script can be transformed into:

- Narrative outline
- Shot list
- Storyboard
- B-roll plan
- Editing notes
- On-screen text suggestions
- Estimated scene timings
- Production checklist

The system should preserve traceability between script passages and proposed shots.

### Success condition

Creators can produce and adopt a meaningfully improved script without manually reconstructing AI suggestions in another document.

---

# 7. Screen 4 — See the Better Cut

## 7.1 Purpose

This should be the product's defining experience.

Instead of telling a creator that an edit might improve a video, Retention Loop should show the creative alternative wherever technically possible.

**The primary value is experiencing the difference.**

## 7.2 Primary UI

A video comparison workspace featuring:

**Original Cut**

The creator's existing video.

**Proposed Cut**

An alternative assembled from actual available media.

The creator can play either version and inspect exactly how they differ.

### Comparison modes

**Side by side**

Two players shown simultaneously.

**A/B toggle**

Switch between original and proposed cuts using a shared review position.

**Sequential**

Watch one version and then the other.

**Timeline diff**

Inspect removed, reordered, extended, or replaced segments.

The interface should make duration and sequencing changes immediately apparent.

## 7.3 Proposed changes

The AI may recommend:

- Removing a slow introduction
- Starting with a demonstration
- Moving a payoff earlier
- Reordering sections
- Trimming repeated explanations
- Tightening pauses
- Removing unnecessary segments
- Moving B-roll
- Revising transitions
- Adding on-screen context
- Inserting new footage or voiceover where the creator can supply it

### Important technical distinction

Operations fall into three categories.

**A. Directly executable**

Changes possible using available footage and supported deterministic editing operations.

Examples: trim, split, reorder, concatenate, simple audio fades.

**B. Partially executable**

Changes that require additional editing, asset selection, or review.

Examples: replacing narration, fixing visual continuity, inserting appropriate B-roll.

**C. Suggested but not executable**

Changes requiring footage, dialogue, or assets that do not exist.

The interface must clearly distinguish these categories.

Never portray an unrendered suggestion as a completed playable edit.

## 7.4 Edit decision panel

For each proposed change, show:

- Source timestamps
- Proposed destination timestamps
- Operation type
- Explanation
- Related channel lessons
- Required assets
- Technical warnings

Example:

**Move demonstration earlier**

Original: 02:35–02:58  
New position: 00:00–00:23

**Shorten introductory setup**

Original: 00:00–00:58  
Proposed: approximately 15–20 seconds

**Preserve technical walkthrough**

Keep the detailed explanation after the demonstration.

Each operation should be independently enabled, disabled, or modified.

## 7.5 Creator controls

- Preview original
- Preview proposed
- Toggle individual edits
- Select alternative treatment
- Request a different cut
- Restore original
- Inspect editing decisions
- Export rendered variant, where available
- Export editable timeline or instructions

All editing actions must preserve the original source assets.

## 7.6 Script-to-video continuity

When a project already includes a script or shot plan, the video-analysis system should reuse it.

It should identify:

- Script passages represented in the footage
- Planned scenes that were omitted
- Demonstrations that moved
- Differences between intended and actual narrative structure
- Important promises that remain unresolved
- Material added during filming or editing

This provides a direct connection between the creator's creative intent and the executed video.

## 7.7 Editing artifacts

Support progressively:

- Timecoded edit instructions
- Structured edit-operation JSON
- OpenTimelineIO
- FCPXML or another verified editor-compatible format
- Simple EDL exports
- Remotion-compatible project instructions
- Rendered previews of deterministic cuts

Test compatibility with individual editing applications.

Do not assume a generic EDL can express all effects, transitions, or track structures.

### Success condition

A creator can evaluate an actual alternative cut without manually recreating it.

When rendering is not possible, the system should deliver a precise, credible edit plan instead.

---

# 8. Screen 5 — Learn From Viewers

## 8.1 Purpose

Use real audience response to understand the performance of published videos and improve future decisions.

Analytics should appear as an explanation of results, not as the primary reason to open the product.

## 8.2 Primary UI

The published video remains central.

The AI presents a small number of important discoveries.

Examples:

**Observed**

Early retention declines more sharply than the channel's comparable-video baseline.

**Hypothesis**

The demonstration may arrive too late.

**Historical lesson**

Comparable videos with earlier demonstrations have sometimes maintained stronger opening retention.

These statements must remain clearly differentiated.

## 8.3 Evidence on demand

Selecting a finding opens an evidence drawer containing:

- Retention curve
- Expected baseline
- Relevant video interval
- Transcript excerpt
- Narrative beat sequence
- Audio and visual features
- Comparable historical videos
- Supporting and contradictory examples
- Alternative hypotheses
- Uncertainty and data limitations

The video preview, transcript, and curve should synchronize where supported.

## 8.4 Anomaly analysis

Use deterministic signal-processing techniques to identify candidate retention anomalies.

Candidate approaches:

- Robust smoothing
- Local slope analysis
- Change-point detection
- Residual analysis against expected decay
- Comparison against relevant historical curves

Detector agreement alone should not be treated as independent confirmation.

Analyze contextual windows before and after an anomaly.

The cause of viewer departure may precede the observed drop.

## 8.5 YouTube retention constraints

The YouTube Analytics API reports normalized retention positions rather than precise per-viewer timelines.

Do not infer second-level measurement precision from interpolation.

`audienceWatchRatio` can be affected by replaying and skipping and must not automatically be interpreted as the fraction of unique viewers who survived to a timestamp.

Use segment entry and exit metrics where authorized and available.

Analytics may arrive with significant reporting delay.

## 8.6 Competing hypotheses

For a meaningful anomaly, the AI should consider alternative explanations.

Example:

- Setup is too long
- Explanation is too technical
- Viewer expectations don't match the content
- Viewers have already obtained the answer they wanted

The system must not claim causal certainty without appropriate experimental evidence.

## 8.7 Learning outputs

After analysis, the system proposes:

- Reusable channel lessons
- Future script improvements
- Potential recuts
- A/B experiments
- Topics or formats worth revisiting

The creator can save, challenge, edit, or dismiss these lessons.

### Success condition

The creator understands the most actionable discoveries without needing to manually inspect an entire analytics dashboard.

---

# 9. Screen 6 — Improve and Repeat

## 9.1 Purpose

Turn insights into the next creative action.

This screen closes the loop between previous performance and future production.

## 9.2 Two primary directions

### Improve existing content

Present promising back-catalog opportunities.

Example:

"Your older AI agents tutorial has a long setup compared with stronger recent videos. Want to explore a payoff-first recut?"

Possible actions:

- Preview a new opening
- Generate an edit pack
- Prepare a new upload
- Create a shorter derivative
- Recommend a remake
- Review a packaging change

Be explicit about what YouTube supports in place versus what requires a new upload.

### Apply lessons to upcoming content

Example:

"Your next coding-agent comparison could reuse the clearer opening structure from your strongest recent tutorial."

Actions:

- Apply to current script
- Generate a new creative direction
- Create a reusable narrative template
- Start a new project
- Prepare an experiment

## 9.3 Opportunity feed

The system should proactively surface a small collection of potentially valuable actions.

Each item includes:

- Proposed action
- Why it matters
- Supporting evidence
- Expected effort
- Uncertainty
- Preview or example
- Clear next action

Avoid overwhelming users with dozens of undifferentiated recommendations.

## 9.4 Ranking opportunities

Consider:

- Relevance to the creator's goals
- Historical performance
- Strength of evidence
- Potential value
- Editorial effort
- Production feasibility
- Topic freshness
- Experimentability
- Creator interest
- Novelty

Do not use opaque numerical scores without explaining their meaning.

### Success condition

Every substantial analysis creates a natural path to a useful next action.

---

# 10. Channel Memory

## 10.1 Role

Channel Memory is the intelligence behind the AI Director.

It is not primarily a database of summaries.

It is a living model of the creator's editorial decisions, audience response, creative strengths, recurring weaknesses, and validated lessons.

## 10.2 What it should remember

**Channel identity**

- Subject matter
- Target audience
- Creator goals
- Preferred tone and style
- Production constraints

**Content history**

- Published videos
- Topics and formats
- Scripts and narrative structures
- Relevant audiovisual features
- Audience performance
- Strong and weak moments

**Editorial decisions**

- What the creator chose to make
- Which AI recommendations they accepted
- Which alternatives they rejected
- What was actually changed
- Why a decision was made, when known

**Lessons**

- Repeated observations
- Successful patterns
- Contradictions
- Conditions where patterns apply
- Experimentally supported findings

**Experiments**

- Tested interventions
- Control and variant definitions
- Measured outcomes
- Uncertainty
- Resulting updates to recommendations

## 10.3 Lesson structure

Each lesson should contain:

| Field | Description |
|---|---|
| ID | Stable identifier |
| Claim | What the system believes it has learned |
| Scope | Relevant channel, format, topic, or audience context |
| Evidence | Supporting observations and experiments |
| Counterexamples | Evidence that contradicts the claim |
| Status | Observation, hypothesis, experimentally supported, inconclusive |
| Applicability | When the lesson should be used |
| Strength | Evidence strength and uncertainty |
| Suggested use | Relevant creative actions |
| Last updated | Most recent review |

## 10.4 Memory retrieval

When developing a new script, the system should retrieve a small number of highly relevant lessons.

Retrieval must consider:

- Topic similarity
- Video format
- Creator's present goal
- Narrative structure
- Historical reliability
- Recency
- Contradictory evidence

A lesson about long-form tutorials should not automatically be applied to Shorts or entertainment videos.

## 10.5 Learning from creator decisions

Creator feedback should update the system's model of their preferences.

Examples:

- Prefers shorter openings
- Dislikes exaggerated clickbait
- Values technical accuracy over aggressive pacing
- Wants unusual video ideas
- Prefers direct demonstrations

Editorial preference learning must remain separate from evidence about audience outcomes.

A creator accepting a recommendation does not prove it improved retention.

## 10.6 Memory evolution

Support:

- Adding new lessons
- Updating previous lessons
- Discovering contradictions
- Merging duplicates
- Reducing confidence
- Marking lessons outdated
- Manual creator corrections
- Traceability to original evidence

Personalization should improve incrementally but must not claim reliability simply because a channel has accumulated a certain number of videos.

---

# 11. Editorial Intelligence

## 11.1 Future topic recommendations

The AI Director should proactively identify potential topics based on:

- Historically successful subjects
- Strong formats
- Audience interests
- Repeated audience questions
- Underexplored combinations
- Relevant industry developments, where authorized external sources exist
- Existing evergreen videos that could become updated content

Topic suggestions should balance past evidence with originality.

## 11.2 Topic output

A recommendation includes:

- Working title
- Interesting angle
- Target viewer
- Viewer promise
- Proposed opening
- Suggested narrative
- Evidence from historical videos
- Relevant risks
- Production difficulty
- Alternative creative treatments

## 11.3 Creative exploration

The system should support both optimization and exploration.

**Optimization**

Suggest formats or structures with favorable historical evidence.

**Exploration**

Suggest ambitious, unusual, or unproven approaches.

Do not automatically suppress original concepts because the channel has no historical performance data for them.

## 11.4 Editorial briefs

The AI can generate:

- One-page creative brief
- Full narrative outline
- Script
- Shot plan
- Storyboard
- Production checklist
- Editing notes

All outputs should remain attached to the same project.

---

# 12. Video Editing and Generation Engine

## 12.1 Two distinct capabilities

The technical system must separate:

**Editorial reasoning**

Determines what should be changed and why.

**Edit execution**

Transforms available assets into a usable alternative.

This prevents the language model from pretending an instruction has already become an edited video.

## 12.2 Initial edit operations

Prioritize reliable deterministic operations:

- Trim
- Split
- Reorder
- Concatenate
- Remove pauses
- Basic audio fades
- Simple text overlays
- Basic transitions, where supported

Later extensions:

- Improved audio continuity
- B-roll selection
- Voiceover replacement
- Captions and typography
- AI-generated supplementary assets
- Editor-specific timeline transformations

## 12.3 Structured edit plan

Represent each edit as a typed operation containing:

- Operation ID
- Source asset ID
- Source in/out points
- Target insertion point
- Operation type
- Dependencies
- Required assets
- Creative rationale
- Review status
- Execution status
- Output timeline mapping

An edit plan can produce both human-readable instructions and machine-executable transformations.

## 12.4 Video preview pipeline

1. Analyze source video and transcript.
2. Identify proposed creative intervention.
3. Construct structured edit operations.
4. Verify source coverage and dependencies.
5. Generate a low-resolution preview from actual available footage.
6. Let the creator compare and revise.
7. Render or export the approved result.

Generated previews should preserve source-video integrity and avoid accidental audio discontinuities.

If a proposed edit requires missing media, display it as a plan or storyboard rather than presenting a fabricated finished result.

## 12.5 Source-to-output mapping

Maintain a mapping between source-video time and generated-cut time.

This supports:

- Transcript synchronization
- Reversible edits
- Comparison playback
- Export to editors
- Narrative-beat alignment
- Experiment analysis across versions of different lengths

---

# 13. Experimentation and Continuous Improvement

## 13.1 Experiment creation

Creators should be able to turn a proposed improvement into a test.

Example:

**Hypothesis**

Showing the working demonstration before the explanation improves opening engagement.

**Control**

Original opening.

**Treatment**

Payoff-first opening.

**Primary outcome**

Watch time per assigned impression, if available and appropriate to the experiment.

**Secondary outcomes**

Opening retention, average view duration, and other relevant engagement measures.

## 13.2 Experiment validity

Record:

- What changed
- What stayed constant
- Whether assignment was randomized
- Audience comparability
- Duration and publication conditions
- Evaluation window
- Outcome availability
- Uncertainty
- Confounding variables

Reuploading a modified video does not automatically create a controlled experiment.

## 13.3 YouTube integration

Design an abstraction for experiment variants.

Initially support manually specified experiments and imported outcomes.

Integrate with official video-cut testing only when the feature and suitable access are actually available.

Do not assume YouTube's current analytics interfaces expose variant-specific retention or experiment outcomes.

## 13.4 Outcomes and lessons

Experiments should update relevant channel lessons.

The system distinguishes:

- Experimentally supported improvement
- Negative result
- Inconclusive result
- Observational comparison

Avoid presenting uncertain predictions as guaranteed increases in retention or views.

---

# 14. System Architecture

## 14.1 Main subsystems

### Application frontend

Responsibilities:

- Universal input composer
- Project workspace
- Script comparison and editing
- Video comparison and preview
- Opportunity feed
- Evidence inspector
- Channel memory browser
- Export controls

### Ingestion service

Responsibilities:

- YouTube authentication
- Metadata and analytics retrieval
- Creator-provided media upload
- Script and transcript ingestion
- File validation
- Historical snapshot collection

### Media understanding service

Extracts:

- Transcript with timestamps
- Speaker segments
- Shot boundaries
- Visual changes
- Motion features
- Audio features
- Narrative beats
- Script-to-media alignment

### Analytics engine

Handles:

- Retention normalization
- Expected baseline estimation
- Positive and negative anomaly detection
- Comparable video selection
- Performance analysis
- Statistical uncertainty

### Channel memory service

Handles:

- Historical evidence retrieval
- Lesson extraction
- Context-aware retrieval
- Contradiction detection
- Creator preferences
- Lesson updates

### AI Director orchestration

Coordinates:

- Input interpretation
- Appropriate analysis tools
- Creative ideation
- Script improvement
- Alternative generation
- Investigation
- Edit-plan generation
- Output validation

Start with one orchestrator and structured specialist tools.

Do not introduce multiple independent AI agents until evaluations establish their benefit.

### Video processing service

Handles:

- Media probing
- Timeline operation validation
- Preview rendering
- Audio continuity checks
- Output rendering
- Editing artifact export

### Experiment service

Handles:

- Test specifications
- Variant relationships
- Results ingestion
- Outcome analysis
- Experiment-based learning

## 14.2 Suggested initial stack

- **Frontend:** React / Next.js with TypeScript
- **Backend:** TypeScript or Python services
- **Database:** PostgreSQL
- **Object storage:** S3-compatible storage
- **Retrieval:** PostgreSQL full-text and vector search initially
- **Media processing:** FFmpeg and compatible timeline tools
- **Background jobs:** Durable queue with retry support
- **AI:** Tool-calling language models plus audiovisual feature extractors
- **Analytics:** Python numerical and statistical libraries

Avoid specialized infrastructure until the workload justifies it.

## 14.3 Core data entities

| Entity | Purpose |
|---|---|
| Channel | Connected account and creator settings |
| Project | Persistent creative context |
| Artifact | Idea, script, shot plan, video, or other project material |
| ArtifactVersion | Immutable revision or generated alternative |
| SourceAsset | Uploaded or authorized media |
| TimelineSegment | Timecoded media and narrative representation |
| EditPlan | Structured proposed transformations |
| EditOperation | Individual executable or advisory change |
| Analysis | Versioned processing result |
| Finding | Evidence-backed observation |
| Hypothesis | Possible explanation requiring validation |
| Lesson | Persistent channel knowledge |
| Recommendation | Proposed creative action |
| Experiment | Test design and variant information |
| Outcome | Measured results |
| Feedback | Creator preferences and decisions |
| Job | Asynchronous processing state |

All derived objects should reference their source data, model version, and processing configuration.

## 14.4 Project and revision model

Each project maintains an event history.

Examples:

- Idea created
- Script imported
- Direction selected
- Script version generated
- Paragraph accepted
- Video uploaded
- Edit plan proposed
- Preview rendered
- Edit approved
- Video published
- Analytics ingested
- Lesson updated

This supports undo, provenance, and continuous context.

## 14.5 Processing states

Long-running processing jobs should expose understandable states.

Examples:

- Uploading
- Preparing media
- Transcribing
- Analyzing
- Generating alternatives
- Rendering preview
- Ready for review
- Needs additional source material
- Failed — retry available

Creators should be able to leave the workspace and return without losing progress.

Text editing and creative exploration should remain available while media processing is underway.

## 14.6 YouTube-specific constraints

- Retention analytics are not real-time.
- Retention positions have limited temporal resolution.
- Some metrics and reports may be unavailable.
- The YouTube Data API is not a general-purpose raw-video download API.
- YouTube API storage, derived-metrics, and usage policies must be reviewed before commercial release.
- Channel analytics alone do not grant access to creator source media.
- Existing published uploads generally cannot have their source file replaced.
- Full recuts may require new uploads or eligible native testing capabilities.

The system must degrade gracefully when data or permissions are unavailable.

---

# 15. UX and Interaction Requirements

## 15.1 Low-friction defaults

The product should not require creators to:

- Configure analysis agents
- Manually select models
- Choose analytics algorithms
- Fill out extensive creative briefs
- Repeatedly explain their channel
- Navigate into a dashboard to obtain recommendations
- Manually copy generated text between product screens

Defaults should be editable but rarely required.

## 15.2 Progressive disclosure

Use three levels of information.

**Level 1 — Creative output**

The recommended idea, rewritten passage, or proposed cut.

**Level 2 — Explanation**

Why the AI proposes this change and what evidence supports it.

**Level 3 — Full investigation**

Historical comparisons, analytics, confidence, transcript segments, and alternative hypotheses.

Do not expose Level 3 by default.

## 15.3 Consistent actions

Across scripts and videos, reuse recognizable controls:

- Explore alternatives
- Compare
- Accept
- Reject
- Modify
- Undo
- Explain
- Export

Avoid inventing different interaction conventions for every content type.

## 15.4 Preservation of creative voice

The creator must be able to provide style preferences and override AI editorial choices.

The AI should not automatically:

- Exaggerate claims
- Introduce sensationalist hooks
- Fabricate outcomes
- Remove necessary technical detail
- Change factual meaning
- Impose an inconsistent personality

Creative recommendations should preserve accuracy and the creator's intent.

## 15.5 Trust and transparency

Use clear labels:

- Observed
- Hypothesis
- Historically associated
- Experimentally supported
- Inconclusive

Generated examples must not be presented as measured results.

## 15.6 Device priorities

Desktop is the primary editing and comparison experience.

Mobile should support:

- Starting ideas
- Reviewing suggestions
- Reading scripts
- Approving directions
- Browsing opportunities
- Watching previews

Complex timeline editing may remain desktop-focused.

---

# 16. End-to-End Example

## Scenario: Creator making a coding-agent comparison

### Step 1 — Idea

The creator enters:

"I want to compare Gemini CLI and Codex on a real project."

The AI proposes three editorial directions, informed by relevant channel history.

The creator chooses a practical showdown format.

### Step 2 — Script

The AI generates an outline and opening.

The creator uploads a draft script.

The AI identifies a lengthy setup and produces a payoff-first alternative.

The creator compares the versions and accepts selected changes.

### Step 3 — Production planning

The AI generates a shot plan based on the approved script.

The plan includes demonstrations, B-roll suggestions, and narrative beats.

### Step 4 — Rough cut

The creator uploads a video export.

The AI aligns the footage to the script and identifies an opportunity to move a demonstration earlier.

It generates a revised edit plan and, if the footage permits, a playable alternative.

### Step 5 — Comparison

The creator watches the original and revised openings.

They approve the new sequence, modify a transition, and export the cut or editing instructions.

### Step 6 — Publication

The creator publishes the video.

The project stores the publication reference.

### Step 7 — Learning

After analytics become available, Retention Loop identifies meaningful performance patterns.

It compares the results against previous relevant videos and generates evidence-backed observations.

### Step 8 — Next action

The AI identifies a related older video that might benefit from a similar edit.

It also suggests an original follow-up concept informed by the newly observed audience behavior.

The channel memory evolves, and the next project benefits from it.

---

# 17. MVP Scope

The MVP must validate the product's defining interaction:

**Can a creator provide something they've made and receive a better alternative they can immediately evaluate and use?**

Do not attempt to launch the entire creator intelligence platform at once.

## Phase 0 — Data and Technical Feasibility

Implement:

- Creator-provided script ingestion
- Source video upload
- Transcript generation
- Media probing and timestamp alignment
- Basic YouTube channel connection
- Supported analytics retrieval
- API compliance review

**Exit criterion:** Reliable access to representative scripts, creator-owned videos, and authorized historical analytics.

## Phase 1 — AI Director for Scripts

Implement:

- Universal input composer
- Idea-to-angle generation
- Script editor
- Multiple rewrite alternatives
- Side-by-side comparison
- Accept/reject/undo
- Basic channel context retrieval
- Text and shot-list export

**Exit criterion:** Creators can produce useful, adoptable script improvements with less effort than using a generic chatbot and manually combining its responses.

## Phase 2 — AI Director for Video

Implement:

- Video upload
- Transcript and shot segmentation
- Basic audiovisual analysis
- Proposed timeline operations
- Deterministic trim/reorder execution
- Actual preview generation
- Original versus proposed comparison
- Export of rendered previews and edit plans

**Exit criterion:** Creators can review technically valid alternative video cuts assembled from their source footage.

This phase is essential to proving the strongest product differentiation.

## Phase 3 — Channel Intelligence

Implement:

- Historical video ingestion
- Retention anomaly detection
- Comparable-video selection
- Evidence-backed findings
- Persistent channel lessons
- Contextual lesson retrieval
- Basic opportunity recommendations

**Exit criterion:** Channel-specific suggestions are measurably more useful than generic creative suggestions.

## Phase 4 — Learn and Retry

Implement:

- Published-video performance analysis
- Back-catalog opportunity detection
- Improvement packs
- Creator feedback capture
- Experiment specifications
- Outcome tracking
- Lesson updates

**Exit criterion:** A creator can trace a recommendation from evidence to implemented change and subsequent outcome.

## Phase 5 — Advanced Capabilities

Consider:

- AI-generated supplementary footage
- More sophisticated video editing
- NLE plugin integrations
- Automated editorial review
- Native experiment integrations
- Personalized intervention-effect estimates
- External topic opportunity research
- Collaboration and team workflows

Do not prioritize these before establishing consistent user value.

---

# 18. MVP Acceptance Criteria

## Creative quality

- Alternatives are meaningfully different rather than superficial rewrites.
- Recommendations respect creator constraints.
- Script changes preserve factual meaning.
- Output is immediately editable or usable.
- Historical evidence is applied when relevant and available.

## Video editing quality

- Preview footage comes from actual authorized source material.
- Timeline operations are correct and reversible.
- Audio and video continuity defects are detected.
- Missing assets are clearly identified.
- Exported outputs match approved operations.

## User experience

- Text-based projects can begin without channel connection.
- Starting from a script requires no manual analysis configuration.
- A creator can compare alternatives without leaving the project.
- Evidence is available without dominating the default view.
- Rejected changes are not silently reapplied.
- Work survives interruptions and processing failures.

## Intelligence quality

- Observations and hypotheses are differentiated.
- Lessons cite supporting historical evidence.
- Counterexamples are retained.
- Channel-specific recommendations are evaluated against generic alternatives.
- The system abstains from unsupported causal claims.

---

# 19. Evaluation and Success Metrics

## Primary product metric

**Useful creative improvements adopted per active creator.**

This should reflect actual creative work, not simply the number of AI suggestions generated.

## Activation

- Time to first useful alternative
- Percentage of creators reaching a comparison view
- Percentage accepting or modifying a generated alternative
- Percentage exporting or implementing an output

## Engagement

- Projects revisited
- Scripts revised
- Video alternatives previewed
- Edits accepted
- Repeat use across publication cycles
- Opportunities acted upon

## Quality

- Creator-rated usefulness
- Creator-rated originality
- Editorial effort saved
- Technical edit success rate
- Evidence quality
- Unsupported-claim rate

## Learning

- Improvement over a generic AI baseline
- Relevance of retrieved channel lessons
- Creator correction rate
- Performance of personalized recommendations on held-out evaluations
- Outcomes from valid experiments

## Business

- Creator retention
- Frequency of use
- Conversion to paid workflows
- Cost per completed analysis or render
- Willingness to pay for creative transformations

---

# 20. Major Risks

## Risk A — Becoming another generic AI writing tool

Script rewrites and video ideas are widely accessible through general-purpose AI systems.

**Mitigation:** Make channel-specific memory, high-quality comparisons, integrated project history, and actual video transformations central to the value proposition.

## Risk B — Video editing proves technically difficult

Script rewriting is much easier than generating coherent, playable video cuts.

**Mitigation:** Begin with deterministic operations on existing footage. Expand only when render quality and source availability justify it.

## Risk C — AI recommendations are plausible but wrong

A retention cliff doesn't establish why viewers left.

**Mitigation:** Evidence classifications, competing hypotheses, uncertainty, human review, and experiment tracking.

## Risk D — Channel history creates creative conservatism

Overemphasis on past performance could encourage repetitive content.

**Mitigation:** Explicit exploration modes and recommendations that reward differentiation and creator interest.

## Risk E — The product becomes a burdensome project manager

Creators already use multiple production tools.

**Mitigation:** Support one-off tasks, flexible project creation, exports, and eventual editor integrations. Never require full lifecycle adoption to receive value.

## Risk F — Personalization is weaker than advertised

Small channels and heterogeneous catalogs may not support robust statistical conclusions.

**Mitigation:** Conservative claims, format-aware comparisons, clear data limitations, and useful functionality without personalization.

## Risk G — High processing cost

Full media analysis and repeated rendering can be expensive.

**Mitigation:** Cache extraction, use targeted analysis, generate low-resolution previews, render only selected alternatives, and reuse source features.

---

# 21. Non-Goals for V1

Retention Loop V1 will not attempt to:

- Replace professional nonlinear video editors
- Fully automate video production
- Autonomously publish videos
- Guarantee retention improvements
- Predict exact view counts
- Automatically download arbitrary YouTube videos
- Provide unrestricted competitor-channel analysis
- Build a complex multi-agent dashboard
- Offer advanced 3D analytics visualizations
- Force creators into a complete production management workflow
- Train unrestricted cross-channel models from private analytics

The initial product should be intentionally focused.

---

# 22. Final Product Definition

Retention Loop is not primarily:

- A YouTube analytics dashboard
- A retention curve investigation tool
- An AI scriptwriter
- An automated video editor
- A content calendar
- A collection of autonomous creator agents

It is an **AI Director with persistent channel intelligence**.

Its defining experience is:

1. Give it something you're working on.
2. See stronger creative alternatives.
3. Compare them directly.
4. Keep the changes you like.
5. Understand the relevant evidence when needed.
6. Learn from real audience response.
7. Carry those lessons into whatever you make next.

The interface should make sophisticated analysis feel nearly invisible.

The underlying system may involve statistical models, multimodal understanding, retrieval, editing pipelines, experimentation, and persistent learning.

But the creator should primarily experience one simple promise:

# Make it better.

Not by reading another report.

By seeing what better could look like, choosing what works for them, and improving their creative decisions over time.

---

## Appendix A — First-Release Screen Inventory

| Screen | Primary interaction | Required output |
|---|---|---|
| 1. Start Anywhere | Submit idea, script, or media | Immediate useful next step |
| 2. Find the Angle | Explore and select creative treatments | Editable creative brief |
| 3. Rewrite Together | Compare, modify, accept script alternatives | Improved script and shot plan |
| 4. See the Better Cut | Compare original and alternative media | Approved cut or edit plan |
| 5. Learn From Viewers | Review findings and optional evidence | Actionable channel lessons |
| 6. Improve and Repeat | Choose next action or archive revision | New project, recut, or experiment |

These are **six contextual views within one continuous experience**, not six mandatory stages.

## Appendix B — Key Product Decisions

| Decision | Selected direction |
|---|---|
| Primary metaphor | AI Director |
| Primary interface | Universal composer + contextual project workspace |
| Main object | Creative project with versioned artifacts |
| Core capabilities | Explore, Improve, Compare |
| Default output | Tangible creative alternatives |
| Primary differentiator | Channel-aware transformation with direct comparison |
| Analytics UI | Evidence on demand |
| Personalization | Persistent, evidence-linked channel memory |
| Video editing | Deterministic execution first |
| Experiments | Hypothesis-driven, with explicit uncertainty |
| First monetizable value | Better scripts and usable alternative edits |
| Ultimate moat | Accumulated creator context, editorial decisions, and validated outcomes |

**North star:** Every new video should benefit from what the creator and their audience have already learned.
