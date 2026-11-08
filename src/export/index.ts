/**
 * Drift - Export Module
 * Provides snapshot PNG export and high-framerate WebM/MP4 video recording.
 */

export {
  exportSnapshot,
  getBackgroundColor,
  getExportTimestamp,
  type SnapshotOptions,
} from './exportSnapshot';

export {
  VideoRecorder,
  formatDuration,
  getSupportedVideoMimeType,
  type CodecOption,
  type RecordingStatus,
  type VideoRecorderOptions,
} from './exportVideo';
