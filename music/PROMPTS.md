# PULSEBEAT — Lyria 3 Pro 곡 생성 프롬프트 (8곡)

각 곡의 프롬프트 블록을 **통째로 복사**해서 Lyria 3 Pro(Google AI Studio 또는 Gemini 앱의 음악 생성)에 붙여 넣으세요.
보컬 곡은 프롬프트 맨 아래 `Lyrics:` 밑에 일본어 가사가 들어 있습니다. 가사까지 함께 붙여 넣어야 그 가사대로 부릅니다.

## 저장 방법

생성된 음원을 MP3(또는 WAV)로 내려받아 아래 **파일 이름 그대로** `music/raw/` 폴더에 넣어 주세요.
다 넣으면 알려 주세요. 제가 `node music/chart.mjs`로 템포·박자를 분석해 채보를 만들고 게임에 연결합니다.

| # | 제목 | 저장할 파일 이름 | BPM | 목표 길이 | 보컬 |
|---|---|---|---|---|---|
| 1 | Letters to a Sleeping Server | `music/raw/letters-to-a-sleeping-server.mp3` | 92 | 1:42 | 연주곡 |
| 2 | Mirrorball Protocol | `music/raw/mirrorball-protocol.mp3` | 124 | 1:30 | 연주곡 |
| 3 | 狐火ダイナモ | `music/raw/kitsunebi-dynamo.mp3` | 140 | 2:28 | 연주곡 |
| 4 | わたあめサテライト | `music/raw/wataame-satellite.mp3` | 150 | 2:16 | 일본어 보컬 |
| 5 | 流星ブレーキレス | `music/raw/ryusei-brakeless.mp3` | 158 | 1:20 | 일본어 보컬 |
| 6 | ノイズキャンセル・ハート | `music/raw/noise-cancel-heart.mp3` | 172 | 1:52 | 일본어 보컬 |
| 7 | Glitter Bug Parade!! | `music/raw/glitter-bug-parade.mp3` | 184 | 2:04 | 일본어 보컬 |
| 8 | ZERO-DAY CORONATION | `music/raw/zero-day-coronation.mp3` | 196 | 2:42 | 연주곡 |

> 참고
> - 결과 길이가 목표와 조금 달라도 괜찮습니다. 채보는 실제 음원 길이에 맞춰 만들어집니다.
> - 템포가 프롬프트 BPM과 크게 다르게 나오면 분석이 멈추고 알려 줍니다. 그때는 다시 생성하거나, 들어 보고 실제 BPM을 알려 주세요.
> - 마음에 들지 않으면 같은 프롬프트로 여러 번 생성해서 가장 좋은 것을 고르면 됩니다(결과가 매번 다릅니다).

---

## 1. Letters to a Sleeping Server — Amaoto Archive

- 저장 파일: `music/raw/letters-to-a-sleeping-server.mp3`
- 장르: Emotional Piano Breaks (모바일 리듬게임식 감성 피아노·현악 (입문곡))
- 92 BPM · 목표 1:42 · 연주곡

```text
Emotional piano-led neo-classical track with strings over a gentle breakbeat, tender and nostalgic like a rainy night that slowly turns hopeful; a calm, beginner-friendly song for a rhythm game. Steady 92 BPM in 4/4, strictly constant tempo from the first beat to the last: no rubato, no ritardando, no tempo changes. Key: D major with bittersweet B minor colors. Target duration: about 1 minute 42 seconds (102 seconds), ending cleanly with no fade-out. The pulse is always easy to hear: a soft, round kick on beats 1 and 3 and a clear rim click or brushed snare on beats 2 and 4 in every section, and the piano melody moves mostly in clear quarter and 8th notes. Instrumentation: expressive grand piano lead with crisp, clearly articulated melody notes and left-hand broken-chord 8ths, cello and viola, a soft string ensemble, glassy celesta accents, a light chopped breakbeat with an 8th-note shaker, and a warm sub bass in the climax. Instrumental only, no vocals. Structure: [0:00 - 0:10] Intro: solo piano theme over the soft kick and rim clicks, with a clear first downbeat. [0:10 - 0:31] Theme A: the melody in the piano right hand, cello and viola enter, brushed snare backbeat. [0:31 - 0:52] Theme B: the melody rises, violins answer the piano phrase by phrase, celesta sparkles on the offbeats. [0:52 - 1:03] Build: piano 8th-note arpeggios, strings swell, a short snare fill into the climax. [1:03 - 1:23] Climax: full strings and the piano melody in octaves over the light breakbeat and sub bass, warm and cinematic. [1:23 - 1:42] Outro: the opening piano theme returns over kick and rim clicks and ends on one clean sustained final chord. Energy: gentle and warm throughout, a soft peak at the climax, never frantic. Clean, intimate, well-balanced mix with crisp piano attacks and clear drum transients.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 1:42 (102 seconds).
Tempo: exactly 92 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Instrumental only, no vocals.
```

---

## 2. Mirrorball Protocol — Soul Relay 88

- 저장 파일: `music/raw/mirrorball-protocol.mp3`
- 장르: Nu-Disco Funk House (한국 키음 리듬게임식 펑크 / 누디스코 하우스 (키음 분리형 레이어))
- 124 BPM · 목표 1:30 · 연주곡

```text
Funky nu-disco house, glossy and groovy, a confident late-night set in a retro-future disco lounge. Steady 124 BPM in 4/4, constant tempo throughout with no tempo changes, straight 16th-note feel with no swing. Key: G minor with a dorian flavor. Target duration: about 1 minute 30 seconds (90 seconds), hard ending with no fade-out. Drums: tight four-on-the-floor kick, crisp claps on 2 and 4, open hi-hats on every offbeat, a 16th-note shaker and tambourine accents. Instruments: slap bass with syncopated octave pops, clean 16th-note funk guitar cutting, a punchy brass section (trumpets, trombone, alto sax) playing short syncopated stabs and one memorable riff, vintage tine electric piano chords, lush disco string runs and a filtered analog synth-brass lead. Every part is clean and clearly separated, as if each hit were its own sample. Instrumental only, no vocals. Every melody is played by brass, guitar and synths. Structure: [0:00 - 0:08] Intro: kick, hats and claps only for 4 bars, dry and clear, a one-bar snare fill at the end. [0:08 - 0:23] Groove A: slap bass and guitar cutting enter, electric piano chords on the offbeats. [0:23 - 0:39] Hook 1: the brass riff answers the synth-brass lead in call and response, disco strings swell. [0:39 - 0:46] Stop-time break: the whole band plays tight unison hits on beat 1 and the 'and' of 3 with silence between, then a slap-bass fill leads back in. [0:46 - 1:02] Solo: synth-brass solo with 16th-note funk licks over the full groove, off-beat brass hits. [1:02 - 1:21] Final hook: everything together, the brass riff doubled by the lead, string glissandos, crash every 4 bars. [1:21 - 1:30] Outro: the groove strips back to drums, bass and guitar and ends on one tight unison brass stab with a short cymbal ring. Energy: warm start, steady medium energy, playful peak at the final hook. Polished, bright, punchy retro-modern mix with very clear transients.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 1:30 (90 seconds).
Tempo: exactly 124 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Instrumental only, no vocals.
```

---

## 3. 狐火ダイナモ — KAGURA-REACTOR

- 저장 파일: `music/raw/kitsunebi-dynamo.mp3`
- 장르: Wa-fu Psytrance (아케이드 DJ 리듬게임식 사이키델릭 트랜스 × 북 리듬게임식 와풍(和風))
- 140 BPM · 목표 2:28 · 연주곡

```text
Japanese traditional fusion psytrance, mystical, hypnotic and driving, a fox-fire festival procession through a neon shrine city. Steady 140 BPM in 4/4, constant tempo throughout with no tempo changes. Key: D minor with a Japanese miyako-bushi pentatonic melody. Target duration: about 2 minutes 28 seconds (148 seconds), ending on a hard stop with no fade-out. Drums: tight punchy kick on every quarter note, crisp closed hi-hats, sharp claps on 2 and 4, big taiko ensemble hits marking phrase starts, wooden clapper clacks and wood-block accents, fast snare rolls into each drop. Instruments: rolling galloping psytrance bassline on the off-beat 16ths, sharp shamisen riffs, rippling koto 16th-note arpeggios, a breathy shakuhachi, a bright shinobue bamboo-flute lead, a squelchy 303 acid line, sweeping filtered synth leads and deep gong swells. Instrumental only, no vocals. All melodies are carried by the shinobue flute, shakuhachi, shamisen, koto and synth leads. Structure: [0:00 - 0:14] Intro: solo taiko ensemble and wooden clappers on every beat, a shinobue call and a gong swell, the tempo clear from the first beat. [0:14 - 0:41] Section A: kick and rolling bass enter under a repeating shamisen riff. [0:41 - 0:55] Build: rising koto arpeggios, acid squelch and a snare roll moving from 8ths to 16ths. [0:55 - 1:22] Drop 1: the shinobue lead melody over shamisen stabs, taiko accents and the full psytrance groove. [1:22 - 1:36] Taiko break: kick and bass drop out; large and small taiko play a call-and-response pattern of strong center hits and sharp rim clicks on a strict grid, with koto and shakuhachi above. [1:36 - 1:50] Build 2: the kick returns, rising filter, shamisen tremolo and koto glissandi. [1:50 - 2:17] Drop 2: peak energy, flute and shamisen trade phrases over the acid line and galloping bass, fast koto runs. [2:17 - 2:28] Outro: taiko and full-band unison hits, ending on one massive taiko-and-gong hit and a hard stop. Energy: ceremonial start, hypnotic layering, two strong peaks. Clean, wide, punchy mix with sharp plucked attacks and clear drums.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 2:28 (148 seconds).
Tempo: exactly 140 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Instrumental only, no vocals.
```

---

## 4. わたあめサテライト — Cotton Orbit feat. Yuzuha

- 저장 파일: `music/raw/wataame-satellite.mp3`
- 장르: Kawaii Future Bass (모바일 캐주얼 리듬게임식 카와이 퓨처베이스)
- 150 BPM · 목표 2:16 · 일본어 보컬

```text
Kawaii future bass pop, dreamy, cozy, cute and a little bittersweet, a cotton-candy satellite circling a sleeping neon city. Steady 150 BPM in 4/4, constant tempo throughout with no tempo changes; the drops have a half-time feel (big snare on beat 3) while the kick and claps keep the 150 BPM grid clearly audible. Key: G major. Target duration: about 2 minutes 16 seconds (136 seconds), ending cleanly with no fade-out. Instrumentation: wide detuned supersaw chord swells with heavy sidechain pumping, music-box and glockenspiel plucks, marimba arpeggios, bubbly FM bass, snappy layered claps, straight 16th-note hi-hats with short 32nd-note rolls at phrase ends, pitched vocal-syllable chops used as the lead in the instrumental drops, sparkly white-noise risers before each drop. Vocals: sung entirely in Japanese by a soft, sweet, airy young female voice, gentle and dreamy in the verses and bright in the chorus, with echo backing vocals on the parenthesized words; sing the Japanese lyrics given under the Lyrics: header; no English or Korean lines. Structure: [0:00 - 0:13] Intro: music-box melody with light claps and a soft kick on every beat, a clear first downbeat. [0:13 - 0:26] Verse 1: marimba, plucky bass and 8th-note hats under the vocal. [0:26 - 0:38] Pre-chorus: chords open up, snare build from 8ths to 16ths, riser, one beat of silence. [0:38 - 1:04] Chorus and drop: the sung hook over pumping supersaw chords, then an instrumental vocal-chop drop with syncopated chord stabs. [1:04 - 1:17] Verse 2: back to marimba and bells. [1:17 - 1:30] Build: 16th-note snare roll and riser into one beat of silence. [1:30 - 2:02] Final chorus and drop: the biggest chords and the sung hook, then the vocal-chop lead with glittering bells. [2:02 - 2:16] Outro: music-box melody over claps and kick, ending on one clean sustained chord and a final bell. Energy: soft start, two bright peaks, a gentle ending. Clean, bright, polished mix with crisp claps and clear transients.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 2:16 (136 seconds).
Tempo: exactly 150 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Vocals: sung entirely in Japanese (歌詞はすべて日本語で歌う). Sing the lyrics below exactly as written, following the section tags.

Lyrics:

[Verse 1]
ふわふわ浮かぶ わたあめの衛星
今夜もきみの 窓をまわってる
とけそうな声で 数える星座
ねむれないなら いっしょに起きてよう

[Pre-Chorus]
とどくかな とどけ ちいさなシグナル
ピ・ポ・パ 胸が鳴る (ピ・ポ・パ)

[Chorus]
わたあめサテライト きらめいて
あまい電波で きみを呼ぶよ
ひとりの夜も さみしくないように
ずっと そばを回るから

[Verse 2]
流れ星たちと かくれんぼして
きみの寝顔に 光をこぼす

[Final Chorus]
わたあめサテライト きらめいて
とけない約束 空に描くよ
さよならなんて 言わせないように
ずっと きみを回るから (回るから)
```

---

## 5. 流星ブレーキレス — TURBO AURORA

- 저장 파일: `music/raw/ryusei-brakeless.mp3`
- 장르: Hyper Eurobeat (아케이드 댄스 리듬게임식 하이퍼 유로비트 (파라파라))
- 158 BPM · 목표 1:20 · 일본어 보컬

```text
High-energy hyper eurobeat in a para-para dance style, dramatic, euphoric and reckless, a full-throttle midnight drive under a meteor shower. Steady 158 BPM in 4/4, constant tempo from the first beat to the last with no tempo changes. Key: C minor, with the final chorus lifting up a whole step to D minor at the same tempo. Target duration: about 1 minute 20 seconds (80 seconds), a short arcade edit with a hard stop and no fade-out. Drums: punchy 909-style four-on-the-floor kick, big gated-reverb snare and claps on 2 and 4, busy 16th-note hi-hats, crash every 4 bars. Instruments: octave-jumping synth bass on every 8th note, stacked synth-brass and orchestra-hit stabs, a fast 16th-note arpeggiated saw lead, bright rave piano chords, a wide supersaw pad and engine-rev risers. Vocals: sung entirely in Japanese by a powerful, bright male tenor with a passionate eurobeat delivery, with short female backing echoes and gang shouts on the parenthesized lines; sing the Japanese lyrics given under the Lyrics: header; no English lines apart from the shouted 'Hey!'. Structure: [0:00 - 0:12] Intro: 4 bars of kick and octave bass for a clean downbeat, then the main synth-brass hook riff. [0:12 - 0:24] Verse: stripped to kick, octave bass and a plucky arpeggio under the vocal. [0:24 - 0:30] Pre-chorus: rising chords, gang shouts, 8th-note snare build. [0:30 - 0:43] Chorus: full energy, anthemic sung hook, brass stabs answering each line. [0:43 - 0:55] Instrumental hook: the fast arpeggiated lead and orchestra hits, no vocals. [0:55 - 1:07] Final chorus: key lifts a whole step, maximum energy, stacked backing harmonies. [1:07 - 1:20] Outro: the synth-brass hook one last time, ending on a hard unison stab and crash. Energy: high from the first bar, surging at every chorus. Crisp, loud, clean club mix with very clear kick and bass transients.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 1:20 (80 seconds).
Tempo: exactly 158 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Vocals: sung entirely in Japanese (歌詞はすべて日本語で歌う). Sing the lyrics below exactly as written, following the section tags.

Lyrics:

[Verse]
赤いテールランプ 夜を裂いて
環状線のカーブ 鼓動が鳴る
振り返らないと 決めたんだ
アクセル踏みこむ 午前二時

[Pre-Chorus]
(Hey! Hey!) 風よ もっと速く

[Chorus]
流星ブレーキレス 燃えつきても
この想いだけは 止められない
流星ブレーキレス 夜を駆けろ
ふたりで 銀河の向こうへ

[Final Chorus]
流星ブレーキレス 燃えつきても
この想いだけは 止められない
流星ブレーキレス 夜明けまで
ふたりで 光の向こうへ (向こうへ)
```

---

## 6. ノイズキャンセル・ハート — Stray Amplifier

- 저장 파일: `music/raw/noise-cancel-heart.mp3`
- 장르: Girls-Band J-Rock (모바일 캐릭터 리듬게임식 걸즈밴드 J-록)
- 172 BPM · 목표 1:52 · 일본어 보컬

```text
Fast anime-style girls-band J-rock / pop-punk, emotional, defiant and hopeful, an after-school band playing on a neon rooftop. Steady 172 BPM in 4/4, constant tempo throughout with no tempo changes. Key: E minor, with the chorus opening up to G major. Target duration: about 1 minute 52 seconds (112 seconds), a game-size edit with a hard stop and no fade-out. Band: two overdriven electric guitars (8th-note power chords, palm-muted riffs in the verse), a melodic lead guitar hook, a busy picked electric bass, a live acoustic drum kit with a tight snare backbeat, 8th-note hi-hats, crash accents on downbeats and tom fills every 4 bars, plus a bright piano doubling the chorus melody and a thin string pad. Vocals: sung entirely in Japanese by an energetic young female rock singer with a clear, powerful, slightly husky voice, with shouted band gang vocals on the parenthesized lines; sing the Japanese lyrics given under the Lyrics: header; no English or Korean lines. Structure: [0:00 - 0:11] Intro: four drumstick clicks, a drum fill into the main guitar riff and a unison band hit on the first downbeat. [0:11 - 0:33] Verse: palm-muted guitars, driving bass and hi-hat groove under the vocal. [0:33 - 0:45] Pre-chorus: open chords, snare on every beat building up, a gang count-in shout. [0:45 - 1:07] Chorus: full band, crash cymbals, soaring vocal hook, piano on top. [1:07 - 1:18] Guitar solo: fast melodic lead over the chorus chords. [1:18 - 1:24] Stop-time break: sharp unison band hits with silence between them, then the gang count-in. [1:24 - 1:46] Final chorus: biggest energy, double-kick drums, piano and strings layered. [1:46 - 1:52] Outro: the main riff, ending on one big unison hit with a cymbal choke. Energy: driving from the start, emotional peak in the final chorus. Punchy live-band mix with very clear drums.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 1:52 (112 seconds).
Tempo: exactly 172 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Vocals: sung entirely in Japanese (歌詞はすべて日本語で歌う). Sing the lyrics below exactly as written, following the section tags.

Lyrics:

[Verse]
イヤホンの奥で 鳴り止まないノイズ
「普通」って言葉に 塗りつぶされそうで
それでも指先は げんを探してる
震える声のまま 叫んでもいいかな

[Pre-Chorus]
消せない雑音を 鼓動に変えて
今 ボリュームを上げろ (せーの!)

[Chorus]
ノイズキャンセル・ハート 壊して
ありのままの音で 鳴らせ
ひとりじゃないって 気づいたんだ
重なるコードが 夜を照らす
(届け!) 届け この叫び

[Break]
(いち、に、さん、し!)

[Final Chorus]
ノイズキャンセル・ハート 壊して
ありのままの音で 鳴らせ
ひとりじゃないって 何度でも
重なるコードで 明日を照らす
(届け!) 届け この叫び
響け 響け 僕らの歌
```

---

## 7. Glitter Bug Parade!! — PRISM*RAVE feat. Kururi Amane

- 저장 파일: `music/raw/glitter-bug-parade.mp3`
- 장르: Kawaii J-core (아케이드 리듬게임식 카와이 J-core (전파계 보컬))
- 184 BPM · 목표 2:04 · 일본어 보컬

```text
Kawaii J-core / happy hardcore with a denpa-pop vocal, hyper, cute and candy-colored, a parade of glitch bugs dancing out of a broken screen. Steady 184 BPM in 4/4, constant tempo from start to end with no tempo changes. Key: A major. Target duration: about 2 minutes 4 seconds (124 seconds), ending on a sudden hard stop with no fade-out. Instrumentation: hard, punchy four-on-the-floor hardcore kick, off-beat rolling bass stabs, bright detuned supersaw chords, fast 16th-note rave piano rolls, glockenspiel and bell sparkles, square-wave chip blips, pitched-up vocal chops, cute laser and sweep effects, 16th- and 32nd-note snare rolls into the drops. Vocals: sung entirely in Japanese by a high-pitched, sugary, energetic kawaii female voice with bouncy, rapid, playful syllables, chirpy backing shouts on the parenthesized words, and one softly whispered line under the [Breakdown - whispered] tag; sing the Japanese lyrics given under the Lyrics: header; no English or Korean lines. Structure: [0:00 - 0:10] Intro: glockenspiel and piano motif over a filtered kick, a clear first downbeat. [0:10 - 0:21] Build: the full kick enters with off-beat bass and supersaw chords, instrumental. [0:21 - 0:42] Verse: bouncy kick and bass, a bouncy, chant-like rapid vocal, piano stabs. [0:42 - 0:52] Pre-chorus: rising chords and a snare-roll build. [0:52 - 1:13] Chorus drop: huge supersaw wall, the sung hook, 16th-note rave piano. [1:13 - 1:23] Breakdown: half-time feel at the same tempo, 8th-note hi-hats keeping the 184 BPM grid audible, piano, vocal chops and the whispered line. [1:23 - 1:34] Build: snare roll from 16ths to 32nds with a white-noise riser. [1:34 - 1:55] Final chorus: maximum energy with extra bell layers. [1:55 - 2:04] Outro: a screaming 16th-note supersaw lead, then a sudden hard stop on the downbeat. Energy: bouncy start, relentless euphoric peaks. Loud, dense, crisp mastering with very clear kick and snare transients.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 2:04 (124 seconds).
Tempo: exactly 184 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Vocals: sung entirely in Japanese (歌詞はすべて日本語で歌う). Sing the lyrics below exactly as written, following the section tags.

Lyrics:

[Verse]
ぴこぴこ ぴかぴか エラーのお星さま
きらきら きゅるるん 画面にふってくる
ちかちか ちらちら ドットがはねるよ
ぷるぷる ぷにぷに バグバグ ダンス
エラー エラー えらいこっちゃ
でもでも へっちゃら まるごと にっこり
あわてないで だいじょうぶ
バグだってほら おどりだす

[Pre-Chorus]
いち にの さんで リロードしちゃえ
ぐるぐる まわる ハートのカーソル

[Chorus]
キラキラ バグの パレード!!
かわいく こわれて ひかりになれ
ゼロとイチの すきまで ラララ
もっと もっと はしゃいじゃえ (はしゃいじゃえ!)

[Breakdown - whispered]
ねえ きこえる? きみだけのビート

[Final Chorus]
キラキラ バグの パレード!!
ぜんぶ まぜて にじになれ
ゼロとイチの すきまで ラララ
ずっと ずっと とまらない (とまらない!)
```

---

## 8. ZERO-DAY CORONATION — Cantor Omega

- 저장 파일: `music/raw/zero-day-coronation.mp3`
- 장르: Symphonic Artcore (아케이드·모바일 리듬게임 보스곡식 심포닉 아트코어)
- 196 BPM · 목표 2:42 · 연주곡

```text
Symphonic artcore / gabber hardcore final-boss track, menacing, grand and apocalyptic, turning triumphant at the end: the last battle to dethrone a rogue machine empress. Steady 196 BPM in 4/4, felt at the full 196 BPM with a distorted kick on every quarter note (never half-time), constant tempo throughout with no tempo changes, no rubato and no slowdown. Key: D harmonic minor, with the final section in D major. Target duration: about 2 minutes 42 seconds (162 seconds), ending on a hard stop with no fade-out. Drums: heavily distorted pitched gabber kick, snappy snare on 2 and 4, breakbeat ghost snares, 16th-note hats, machine-gun 16th- and 32nd-note snare rolls into each section. Instruments: rolling hardcore bass, cathedral pipe organ, string ensemble spiccato ostinatos, brass fanfares, timpani and orchestral hits, virtuosic grand piano 16th-note runs and arpeggios, harpsichord counterpoint, a screaming hoover lead, on-grid glitch stutter edits, dark synth pads and deep sub bass. Instrumental only, no vocals. Every melody is carried by the organ, strings, brass, piano, harpsichord and the hoover lead. Structure: [0:00 - 0:15] Intro: pipe organ chords over a strict 16th-note harpsichord arpeggio, a ticking hi-hat and timpani on every beat so the tempo is clear from the first bar. [0:15 - 0:34] Phase 1: the distorted kick enters with string spiccato, brass stabs and piano arpeggios. [0:34 - 0:44] Build: rising piano runs and a snare roll. [0:44 - 1:13] Drop 1: hoover lead and pipe organ over the pounding kick, orchestral hits on phrase starts, harpsichord counterpoint against the piano. [1:13 - 1:28] Break: sudden cut to solo piano 16ths and long string chords over a soft 8th-note hi-hat pulse, tense and beautiful. [1:28 - 1:38] Build 2: timpani roll, glitch stutters, 32nd-note snare roll, orchestral stop hits and one beat of silence. [1:38 - 2:07] Drop 2: peak intensity, the fastest piano runs sweeping up and down, harpsichord trading lines with the hoover lead, crash every 4 bars. [2:07 - 2:32] Coronation: triumphant brass fanfare melody in D major with organ and strings, the full kick still driving. [2:32 - 2:42] Outro: stomping unison kick-and-orchestra hits with gaps, a final massive orchestral hit and a hard stop. Energy: ominous opening, relentless escalation, two brutal peaks and a triumphant finale. Loud, aggressive but clear cinematic mix with razor-sharp transients.

Produced for a rhythm game: a clear, steady beat, punchy drums and crisp transients.

Length: about 2:42 (162 seconds).
Tempo: exactly 196 BPM throughout — one constant tempo from the first bar to the last, no tempo changes.
Instrumental only, no vocals.
```
