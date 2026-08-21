# News Rough Cut — Deterministic Execution Template and Acceptance Checklist

> OpenChatCut-native reference. Borrows the common practices of industry deterministic editing workflows (environment check → footage analysis → produce a single deterministic edit plan → execute in one pass → mandatory acceptance).
> Consistent with the rules in this skill's SKILL.md: stay faithful to the source footage, add no external audio, cut speech on semantically complete boundaries, keep the objective and restrained style of news.

## 1. Execution order (fixed sequence, do not skip steps)

1. **Environment and footage check (prerequisite, mandatory)**
   - Use `read_project` / `read_timeline` to confirm the current project and timeline exist and that the target footage clips are present.
   - Build an allowed-source list: record only the `sourceAssetId` and `src` of the news footage the user explicitly specified/selected and its original on-scene audio; when nothing is explicitly specified, include only the news footage and on-scene audio already present on the active timeline. BGM, SFX, voiceover, narration and any other unselected assets in the media pool are excluded without exception.
   - Use `transcribe_track` to get the word-level transcript; if a track cannot be transcribed, fix the asset's reachability first, then continue.
   - Use `view_timeline_frames` to check the key shots against the footage content.
   - Prerequisite not met → stop and report what is missing; do not pretend it is done.

2. **Footage analysis and topic determination**
   - Identify: the news event / core topic / key people / important conclusions / usable footage.
   - Decide how many topics there are: one finished cut revolves around a single core news thread; with multiple topics, pick the one with the highest news value, the most complete information, and the most sufficient footage.
   - Set the upper bound on the finished duration (driven by the amount of information and the length of usable speech; no rigid fixed value).

3. **Produce the edit plan (plan first, act second)**
   - Following the "keep / cut" rules, produce **one explicit edit plan**: the segments to keep (with sentence boundaries), the filler words/repetitions/ads to cut, and the cut points to fine-tune.
   - Principle: open by going straight to the conclusion/latest development/key footage; cut speech only at a complete sentence end, a natural pause, an obvious turn, or a shot transition.
   - This step produces a "deterministic plan"; it is not about making the user sign off at every step — the plan is formed in one pass.

4. **Execute in one pass**
   - Use `edit_item`'s batch update/delete to land trims, ripple deletes and fades; call `split_item` when a clip needs to be cut apart.
   - Speech cuts must land on complete sentence boundaries (guaranteed by the word-level transcript).
   - **Do not add** any BGM / narration / sound effects / transition sounds; do not add `video` / `audio` from the media pool outside the allowed-source list, even if that asset already existed before the edit.

5. **Final acceptance (mandatory, see below)**
   - Run `read_project` again and compare, item by item, the `sourceAssetId` / `src` of every final `video` / `audio` against the allowed-source list; trim, split and move of the same allowed source are legal, any unselected source (including audio carried by newly added video) is not.
   - Play back segment by segment and check: faithful to the facts, semantically complete speech, natural cut-point continuity, no pops or abrupt truncation.

## 2. Mandatory acceptance checklist (every finished cut must pass, item by item)

| Acceptance item | Verdict | If it fails |
|---|---|---|
| Project exists and is readable | `read_project` successfully returns the current active project | Stop, report why the project read failed |
| At least 1 video track clip | There is a kept footage clip on the timeline | Explain that there is no usable footage and that no cut was produced |
| Finished length matches the amount of information | No irrelevant content padded in to hit a duration; no speech/key facts cut off just to compress | Rebalance duration against content |
| Opening goes straight to the core | The first segment is the conclusion/latest development/key footage, with no long wind-up | Adjust the opening |
| Speech is semantically complete | Every kept speech segment expresses a complete idea on its own, with no "cut in the middle of a sentence" | Fix the cut points |
| No external audio | Every final `video` / `audio` belongs to the allowed sources — the news footage/original on-scene audio the user selected; BGM, SFX, voiceover and narration that were already in the media pool but not selected must not be used either | Remove the unselected-source clips and re-run acceptance |
| Cut-point continuity | No abrupt truncation, overlap or obvious volume jumps; fadeInSeconds/fadeOutSeconds can be used to fine-tune | Add a 1-2 frame fade in/out |
| Facts and logic | Does not change the original meaning, exaggerate or downplay, associate things wrongly, present speculation as fact, or use mismatched footage | Fall back to the source footage and re-cut |

## 3. Mapping to SKILL.md tools

- `read_project` / `read_timeline`, `transcribe_track`, `view_timeline_frames`, `edit_item` (trim / ripple delete / fade), `split_item`, `edit_track`.
- The "no added audio" check must compare the allowed sources established at the start against the final `read_project`; it must not treat the whole media pool as the baseline, nor judge by the number of clips on audio tracks.

## 4. Failure recovery

- Any acceptance item fails → go back to the "produce the edit plan" step and re-plan (not from scratch, but pinpointing the step that broke the rule).
- If the timeline gets damaged, it is acceptable to use the project's undo/history to return to the pre-execution state and re-run.
- Only after every acceptance item passes, report "cut complete" and give verifiable results such as the finished duration, the number of kept clips and the number of cut points.
