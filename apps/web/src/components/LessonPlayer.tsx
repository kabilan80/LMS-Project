import { useCallback, useRef, useState } from 'react';
import { LESSON_COMPLETE_THRESHOLD, type LessonPlayback, type ProgressResult } from '@lms/shared';
import useApi from '../hooks/useApi';
import { saveProgress } from '../services/learningService';
import { formatClock } from '../utils/format';
import { YouTubePlayer, type PlayerProgress } from './YouTubePlayer';

interface Props {
  lesson: LessonPlayback;
  /** False for free previews: nothing is saved. */
  track: boolean;
  onResult?: (r: ProgressResult) => void;
}

type SaveState = 'idle' | 'saved' | 'failed';

export function LessonPlayer({ lesson, track, onResult }: Props) {
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const lessonId = lesson.id;
  const [seen, setSeen] = useState<PlayerProgress | null>(null);
  const [done, setDone] = useState(lesson.completed);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const { callAPI: saveProgressAPI } = useApi(saveProgress);

  const save = useCallback(
    async (p: PlayerProgress) => {
      setSeen(p);
      if (!track) return;
      try {
        const result = await saveProgressAPI(lessonId, p);
        setSaveState('saved');
        if (result.completed) setDone(true);
        onResultRef.current?.(result);
      } catch {
        setSaveState('failed'); // the next report tries again
      }
    },
    [lessonId, track, saveProgressAPI],
  );

  const total = seen?.durationSeconds ?? lesson.durationSeconds ?? 0;
  const position = seen?.positionSeconds ?? lesson.lastPositionSeconds;
  const watched = seen?.watchedSeconds ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((Math.max(position, watched) / total) * 100)) : 0;
  const goal = Math.round(LESSON_COMPLETE_THRESHOLD * 100);
  const shown = done ? 100 : percent;

  return (
    <div className="flex flex-col gap-2">
      <YouTubePlayer videoId={lesson.youtubeId} startSeconds={lesson.lastPositionSeconds} onProgress={save} />
      {track && (
        <div className="card py-2.5" aria-label="Video progress">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <b>{done ? 'Lesson complete ✔' : 'Your progress'}</b>
            <span className="text-muted">{total > 0 ? `${formatClock(position)} of ${formatClock(total)}` : formatClock(position)} · {shown}%</span>
          </div>
          <div role="progressbar" aria-valuenow={shown} aria-valuemin={0} aria-valuemax={100} aria-label="Video progress"
            className="relative h-2 w-full overflow-hidden rounded-full bg-track">
            <div className={`h-full rounded-full ${done ? 'bg-success' : 'bg-navy'}`} style={{ width: `${shown}%` }} />
            <span aria-hidden="true" className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${goal}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>{done ? 'You can go to the next lesson.' : `Watch ${goal}% or reach the end to complete this lesson.`}</span>
            <span>{saveState === 'saved' ? 'Progress saved' : saveState === 'failed' ? 'Could not save. Trying again…' : 'Saves automatically'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
