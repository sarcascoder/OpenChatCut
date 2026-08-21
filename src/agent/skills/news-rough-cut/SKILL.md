---
name: news-rough-cut
description: Intelligent news rough cut — cut raw news footage into a short news video that is complete in content, clear in logic, and tight in pacing. Use when the user asks to rough cut news, edit news, cut news footage into a short video, do an intelligent rough cut, news rough cut, edit a news video, or provides news footage (press conference / interview / on-scene / surveillance material) to be cut into a factual news short. Never add music, voiceover, or sound effects.
---

# News Rough Cut

Cut raw news footage into a short news video that is complete in content, clear in logic, and tight in pacing. Stay faithful to the source material, add no external audio, and keep the objective, formal, tight, clear style of informational news.

This is an OpenChatCut-native workflow. Use the current project's assets, transcript, word-level editing, timeline, and editing tools. Do not depend on external download or transcode pipelines.

## Workflow overview

1. **Analyse the footage in full** (mandatory before cutting): identify the news event, core topic, key people, important conclusions and usable visuals in the footage, then decide the through-line of the cut and the final duration. Use `read_project`, `transcribe_track` and `view_timeline_frames` to check the material section by section.
2. **Topic analysis and duration**: judge how many topics the footage covers, and separate the core topic from secondary content.
3. **Content organisation**: open directly on the most important news result / core conclusion / latest development / key on-scene shot, with no build-up.
4. **Execute the cut**: filter by the keep/remove rules, and cut speech at semantically complete boundaries.
5. **Audio: keep only the production sound of the target news footage**: before editing, add only the news footage the user explicitly specified/selected and its original location sound to the allowed sources; when nothing is explicitly specified, use only the news visuals and location sound already present on the active timeline. BGM, sound effects, dubbing, voiceover and other unselected material in the media pool must not enter the allowed sources, even if they were already there.
6. **Final check**: play back section by section to confirm factual fidelity, semantically complete speech, and natural transitions at the cut points.

## Topic analysis and duration

- As a rule, one finished piece follows **a single core news through-line**.
- If the footage contains several unrelated topics, pick the one with **the highest news value, the most complete information, and the most usable visuals**; **do not force unrelated topics together** in the same video.
- The final duration is not fixed; determine it automatically from:
  - the amount of information in the core news story;
  - the length of usable speech from the people involved;
  - the stage of the event and its latest developments;
  - the number of key on-scene shots;
  - the duration needed to keep the news semantically complete.
- When there is little information, **shorten the piece** rather than padding it with unrelated content; when there is a lot, it may run longer — **never cut off someone mid-speech, drop key facts, or break the news logic just to compress the duration**.

## Content organisation logic

Open directly on the most important news result, core conclusion, latest development or key on-scene shot; do not use long build-ups. Organise the whole piece as follows:

1. what happened;
2. what the latest developments are;
3. the final outcome, follow-on impact or related responses.

If the news event is still unfolding, end on **the latest development that has already been confirmed**; never speculate about the outcome.

## Content to keep

Prioritise keeping:

- the core facts of the news event;
- time, place, people and outcome;
- the latest developments and authoritative responses;
- speech from key figures that carries real information;
- news scenes, interviews, press conferences, surveillance footage and other usable material;
- key shots that directly show how the event unfolded, its result, or its impact.

Everything kept must serve the core news through-line.

## Content to remove

Remove:

- advertising and commercial promotion;
- programme promos, channel packaging, opening and closing titles;
- host small talk and link segments with no information;
- repeated statements and repeated shots;
- dead pauses, verbal tics and obvious blanks;
- long background material unrelated to the core event;
- secondary content that does not affect understanding of the news;
- segments that cannot be verified, are vague, or are easily misread.

## Rules for cutting speech

- Speech must stay **semantically complete**.
- Prefer to cut at:
  - the end of a complete sentence;
  - a natural pause by the speaker;
  - a clear turn in what is being said;
  - a natural shot transition.
- **Never** cut in the middle of a sentence, **never** keep only part of a statement in a way that changes its meaning, and **never** wrongly splice together speech from different times or different contexts.
- If a stretch of speech runs long, you may delete repetitive, vague or irrelevant sentences within it, but what remains must **express a complete idea on its own**.
- Use the word-level editing tools (transcript) to trim by word, making sure the cut lands on a complete sentence boundary.

## Factual and logical requirements

The cut must stay faithful to the original news footage. Do not:

- change the meaning of what someone said;
- exaggerate or downplay facts;
- wrongly associate different events;
- manufacture false causality by splicing shots;
- present speculation as established fact;
- mislead viewers with visuals that do not match the news event;
- cut necessary cause-and-effect for the sake of pacing.

## Audio requirements

- **Do not add** any background music, dubbing, voiceover, sound effects, transition stingers or other external audio.
- Keep only the voices directly relevant to the news content and the necessary location sound from the source material.
- Remove advertising music, programme packaging music and any sound unrelated to the core news.
- At cut points, make sure the original voices join naturally — avoid abrupt truncation, overlap, pops or obvious volume jumps (nudge the cut point with `edit_item`'s fadeInSeconds/fadeOutSeconds; do not add music).

## Overall style

- Objective, formal, tight, clear informational news style.
- Let the news content drive the pacing; do not chase a fixed duration or frequent cutting for its own sake.
- Make sure every segment kept carries clear informational value, raising information density while keeping the content complete.
- Add no titles/filters/transition effects; a basic dissolve may be used to avoid a hard cut, but stay restrained as news demands.

## OpenChatCut tool mapping

- `read_project` / `read_timeline`: read the project and timeline state first, and record the allowed sources' `sourceAssetId` and `src` per the scope above; never add the whole media pool automatically.
- `transcribe_track` + word-level transcript editing: cut speech at semantically complete boundaries, remove verbal tics and repetitions.
- `view_timeline_frames`: check the visual content and key on-scene moments.
- `edit_item` (trim / ripple delete / fade) and `split_item` (split): cut per the keep/remove rules and handle the joins at cut points.
- `edit_track`: create, adjust or tighten voice and location-sound tracks when multi-track cleanup is needed.
- Run `read_project` again before output to confirm every final `video` / `audio` item comes from an allowed source and there is no BGM, sound effect, dubbing or voiceover, then use preview/export pre-checks to verify duration and content completeness.

## Reference files

- Follow the fixed deterministic process and the mandatory acceptance checklist when producing the final cut; see [references/deterministic-execution-and-acceptance.md](references/deterministic-execution-and-acceptance.md): environment check → footage analysis → produce a single editing plan → execute in one pass → item-by-item final acceptance (at least 1 video track segment, no new external audio in the finished piece, semantically complete speech, natural joins at cut points).

