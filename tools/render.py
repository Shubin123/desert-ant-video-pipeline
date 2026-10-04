"""Safe original-speed FFmpeg fallback; recordings/enhancement not embedded."""
import json, subprocess, sys
from pathlib import Path

def render(project, source, target):
    if Path(target).exists(): raise ValueError('Output exists; refusing overwrite')
    p=json.loads(Path(project).read_text())['plan']
    if p['seconds'] not in (45,120): raise ValueError('Unsupported target')
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',source]))
    if sum(s['frames'] for s in p['segments'])!=p['seconds']*30: raise ValueError('Invalid frame total')
    filters=[]; pairs=[]
    for i,s in enumerate(p['segments']):
        n=s['frames']; sec=n/30
        if not isinstance(n,int) or n<=0: raise ValueError('Invalid frame count')
        if 'hold' in s:
            if not 0<=s['hold']<duration: raise ValueError('Invalid hold')
            start=round(s['hold']*30)
            filters.append(f'[0:v]trim=start_frame={start}:end_frame={start+1},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={sec},fps=30,trim=end_frame={n},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[v{i}]')
            filters.append(f'anullsrc=r=48000:cl=mono,atrim=end_sample={n*1600},asetpts=PTS-STARTPTS[a{i}]')
        else:
            a,b=s['start'],s['end']
            if not 0<=a<b<=duration+.04 or abs((b-a)*30-n)>1: raise ValueError('Invalid excerpt')
            filters.append(f'[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=1,trim=end_frame={n},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[v{i}]')
            filters.append(f'[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=mono,apad,atrim=end_sample={n*1600},afade=t=in:d=0.025,afade=t=out:st={max(0,sec-.025)}:d=0.025[a{i}]')
        pairs.append(f'[v{i}][a{i}]')
    filters.append(''.join(pairs)+f"concat=n={len(pairs)}:v=1:a=1[v][a]")
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','warning','-n','-i',source,'-filter_complex',';'.join(filters),'-map','[v]','-map','[a]','-c:v','libx264','-crf','20','-c:a','aac','-t',str(p['seconds']),'-movflags','+faststart',target],check=True)

if __name__=='__main__':
    if len(sys.argv)!=4: raise SystemExit('Usage: render.py project.json source.mp4 output.mp4')
    render(*sys.argv[1:])
