export function captionSegmentsForClip(clip) {
  if (!clip.captions || !Array.isArray(clip.captionSegments)) return [];
  const start = Number(clip.start), duration = Number(clip.end) - start;
  return clip.captionSegments.map((s) => {
    const a = Number(s.start), b = Number(s.end), text = String(s.text || "").trim();
    if (!text || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    const localStart = Math.max(0, a - start), localEnd = Math.min(duration, b - start);
    if (localEnd <= localStart) return null;
    const speaker = String(s.speaker || "").trim();
    return { start: localStart, end: localEnd, text: speaker ? speaker + ": " + text : text };
  }).filter(Boolean);
}

export function captionSegmentsForClip(clip) {
  if (!clip.captions || !Array.isArray(clip.captionSegments)) return [];
  const start = Number(clip.start);
  const duration = Number(clip.end) - start;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return [];

  const output = [];
  let previousSpeaker = "";

  for (const segment of clip.captionSegments) {
    const a = Number(segment?.start);
    const b = Number(segment?.end);
    const text = String(segment?.text || "").replace(/\\s+/g, " ").trim();
    if (!text || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;

    const localStart = Math.max(0, a - start);
    const localEnd = Math.min(duration, b - start);
    if (localEnd <= localStart) continue;

    const speaker = String(segment?.speaker || "").trim();
    const words = text.split(/\\s+/).filter(Boolean);
    const chunks = [];
    let current = [];

    for (const word of words) {
      current.push(word);
      const punctuationBoundary = /[.!?,;:][”'")\\]]?$/.test(word);
      if (current.length >= 5 || (current.length >= 2 && punctuationBoundary)) {
        chunks.push(current.join(" "));
        current = [];
      }
    }
    if (current.length) chunks.push(current.join(" "));
    if (!chunks.length) continue;

    const weights = chunks.map((chunk) => Math.max(1, chunk.length));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = localStart;

    chunks.forEach((chunk, index) => {
      const share = weights[index] / totalWeight;
      const chunkEnd = index === chunks.length - 1
        ? localEnd
        : Math.min(localEnd, cursor + (localEnd - localStart) * share);
      if (chunkEnd <= cursor) return;

      const prefix = speaker && speaker !== previousSpeaker && index === 0 ? speaker + ": " : "";
      output.push({
        start: cursor,
        end: chunkEnd,
        text: prefix + chunk,
        speaker: speaker || undefined,
      });
      cursor = chunkEnd;
    });

    if (speaker) previousSpeaker = speaker;
  }

  return output;
}

const glyphs = {
A:["01110","10001","10001","11111","10001","10001","10001"],B:["11110","10001","10001","11110","10001","10001","11110"],C:["01110","10001","10000","10000","10000","10001","01110"],D:["11110","10001","10001","10001","10001","10001","11110"],E:["11111","10000","10000","11110","10000","10000","11111"],F:["11111","10000","10000","11110","10000","10000","10000"],G:["01110","10001","10000","10111","10001","10001","01110"],H:["10001","10001","10001","11111","10001","10001","10001"],I:["11111","00100","00100","00100","00100","00100","11111"],J:["00111","00010","00010","00010","10010","10010","01100"],K:["10001","10010","10100","11000","10100","10010","10001"],L:["10000","10000","10000","10000","10000","10000","11111"],M:["10001","11011","10101","10101","10001","10001","10001"],N:["10001","11001","10101","10011","10001","10001","10001"],O:["01110","10001","10001","10001","10001","10001","01110"],P:["11110","10001","10001","11110","10000","10000","10000"],Q:["01110","10001","10001","10001","10101","10010","01101"],R:["11110","10001","10001","11110","10100","10010","10001"],S:["01111","10000","10000","01110","00001","00001","11110"],T:["11111","00100","00100","00100","00100","00100","00100"],U:["10001","10001","10001","10001","10001","10001","01110"],V:["10001","10001","10001","10001","10001","01010","00100"],W:["10001","10001","10001","10101","10101","11011","10001"],X:["10001","10001","01010","00100","01010","10001","10001"],Y:["10001","10001","01010","00100","00100","00100","00100"],Z:["11111","00001","00010","00100","01000","10000","11111"]," ":["00000","00000","00000","00000","00000","00000","00000"],".":["00000","00000","00000","00000","00000","00110","00110"],"?":["01110","10001","00001","00010","00100","00000","00100"],":":["00000","00110","00110","00000","00110","00110","00000"],"-":["00000","00000","00000","11111","00000","00000","00000"],"!":["00100","00100","00100","00100","00100","00000","00100"],",":["00000","00000","00000","00000","00110","00110","00100"],"'":["00100","00100","00000","00000","00000","00000","00000"],"0":["01110","10001","10011","10101","11001","10001","01110"],"1":["00100","01100","00100","00100","00100","00100","01110"],"2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11110","00001","00001","01110","00001","00001","11110"],"4":["00010","00110","01010","10010","11111","00010","00010"],"5":["11111","10000","10000","11110","00001","00001","11110"],"6":["01110","10000","10000","11110","10001","10001","01110"],"7":["11111","00001","00010","00100","01000","01000","01000"],"8":["01110","10001","10001","01110","10001","10001","01110"],"9":["01110","10001","10001","01111","00001","00001","01110"]
};

function rgb(hex) {
  const v = String(hex || "d3e964").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(v) ? [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)] : [211,233,100];
}

export function captionPpm(text, color) {
  const scale=5, pad=16, value=String(text||"").toUpperCase().slice(0,54);
  const lines=[]; for(let i=0;i<value.length;i+=18) lines.push(value.slice(i,i+18));
  const safe=lines.length?lines:[" "], width=Math.max(220,Math.min(680,Math.max(...safe.map(x=>x.length*6))*scale+pad*2));
  const height=pad*2+safe.length*7*scale+(safe.length-1)*scale, pixels=Array.from({length:width*height},()=>[10,10,10]), fg=rgb(color);
  const set=(x,y,c)=>{if(x>=0&&x<width&&y>=0&&y<height)pixels[y*width+x]=c;};
  safe.forEach((line,li)=>{let x=Math.max(pad,Math.floor((width-line.length*6*scale)/2)),y=pad+li*(7*scale+scale);
    for(const ch of line){const g=glyphs[ch]||glyphs[" "];for(let gy=0;gy<7;gy++)for(let gx=0;gx<5;gx++)if(g[gy][gx]==="1")for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)set(x+gx*scale+sx,y+gy*scale+sy,fg);x+=6*scale;}
  });
  return "P3\n"+width+" "+height+"\n255\n"+pixels.flat().join(" ")+"\n";
}
