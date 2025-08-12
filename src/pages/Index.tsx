import { MusicPlayer } from '@/components/MusicPlayer';
import { AudioPlayerProvider } from '@/components/audio/AudioPlayerProvider';

const Index = () => {
  return (
    <AudioPlayerProvider>
      <MusicPlayer />
    </AudioPlayerProvider>
  );
};

export default Index;
