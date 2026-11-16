import type { RiskTier } from "./scoring/risk";
import type { Finding, Side, TestId, TestResult } from "./scoring/types";

/**
 * Family-facing text in English, Hindi and Tamil.
 *
 * All medical wording comes from these fixed templates rather than a generative
 * model, so the app cannot invent advice. Hindi and Tamil strings should be
 * reviewed by a native speaker (ideally a clinician) before real-world use.
 */

export type Lang = "en" | "hi" | "ta";

export const LANGS: Array<{ code: Lang; name: string; speechLang: string }> = [
  { code: "en", name: "English", speechLang: "en-IN" },
  { code: "hi", name: "हिन्दी", speechLang: "hi-IN" },
  { code: "ta", name: "தமிழ்", speechLang: "ta-IN" },
];

type OnsetWindow = "early" | "day" | "late";

interface Dict {
  tier: Record<RiskTier, { headline: string; advice: string }>;
  finding: Record<Finding, string>;
  test: Record<TestId, string>;
  side: Record<Side, string>;
  explainSide: Record<"face" | "arm", (side: string | null) => string>;
  explain: Record<"speech" | "balance" | "eyes", string>;
  normal: string;
  inconclusive: string;
  lastKnownWell: string;
  onsetUnknown: string;
  ago: (h: number, m: number) => string;
  onset: Record<OnsetWindow, string>;
  /** Label for the main emergency number (ambulance) and for any additional number. */
  callPrimary: (n: string) => string;
  callOther: (n: string) => string;
  disclaimer: string;
  readAloud: string;
  noVoice: string;
  firstAidTitle: string;
  /** Fixed, conservative guidance while waiting for the ambulance. Never generated. */
  firstAid: string[];
  elapsedTitle: string;
  shareTitle: string;
  shareWhatsapp: string;
  shareSms: string;
  shareAddLocation: string;
  shareLocating: string;
  shareLocationFailed: string;
  shareLocationAdded: string;
  shareCopy: string;
  shareCopied: string;
  shareCopyFailed: string;
  shareMessage: (p: { headline: string; ago: string | null; reportUrl: string; mapUrl: string | null }) => string;
}

const en: Dict = {
  tier: {
    emergency: {
      headline: "Warning signs of stroke detected",
      advice: 'Call emergency services now. Say "suspected stroke" and give the time the person was last seen well.',
    },
    possible: {
      headline: "Possible warning signs",
      advice: "Do not wait to see if it gets better. Call emergency services and mention a possible stroke.",
    },
    inconclusive: {
      headline: "Some checks could not be completed",
      advice:
        "If you notice ANY sudden face drooping, arm weakness, speech trouble, vision loss or loss of balance, call emergency services immediately.",
    },
    "no-signs": {
      headline: "No warning signs detected",
      advice: "This check cannot rule out a stroke. If symptoms appear, return, or you are worried, call emergency services anyway.",
    },
  },
  finding: { abnormal: "Warning sign", borderline: "Possible sign", normal: "No sign", inconclusive: "Not assessed" },
  test: { balance: "Balance", eyes: "Eyes", face: "Face", arm: "Arms", speech: "Speech" },
  side: { left: "left", right: "right" },
  explainSide: {
    face: (s) => (s ? `The ${s} side of the face moved less when smiling.` : "One side of the face moved less when smiling."),
    arm: (s) => (s ? `The ${s} arm drifted down or could not be held up.` : "One arm drifted down or could not be held up."),
  },
  explain: {
    speech: "Speech may be slurred, or some words may be wrong.",
    balance: "A balance problem was reported or measured.",
    eyes: "An eye or vision problem was reported or measured.",
  },
  normal: "No warning sign was found in this check.",
  inconclusive: "This check could not be completed.",
  lastKnownWell: "Last known well",
  onsetUnknown: "Unknown. Tell the emergency team when the person was last seen normal.",
  ago: (h, m) => (h > 0 ? `${h} h ${m} min ago` : `${m} min ago`),
  onset: {
    early: "Still within the early window when clot-dissolving treatment may be possible. Every minute counts.",
    day: "Some treatments may still be possible. Get to hospital without delay.",
    late: "Tell the medical team exactly when symptoms began.",
  },
  callPrimary: (n) => `Call ${n} (Ambulance)`,
  callOther: (n) => `Call ${n} (Emergency)`,
  disclaimer:
    "StrokeSense is a screening aid, not a diagnosis. It can miss strokes and can raise false alarms. If in doubt, always call emergency services.",
  readAloud: "Read aloud",
  noVoice: "This device has no voice for this language.",
  firstAidTitle: "While you wait for the ambulance",
  firstAid: [
    "Stay with the person. Keep them calm and comfortable, and do not let them walk around.",
    "Note the time the symptoms started, or when they were last seen normal, and tell the ambulance crew.",
    "Do not give food, drink or medicine, including aspirin. Swallowing may not be safe.",
    "If they are drowsy or vomiting, help them lie on their side.",
    "Loosen tight clothing. Unlock the door and send someone to meet the ambulance.",
    "If they stop responding or stop breathing normally, tell the emergency operator and follow their instructions.",
  ],
  elapsedTitle: "Time since last known well",
  shareTitle: "Send to family or the hospital",
  shareWhatsapp: "WhatsApp",
  shareSms: "SMS",
  shareAddLocation: "Add my location",
  shareLocating: "Getting your location…",
  shareLocationFailed: "Could not get your location. You can still send the message.",
  shareLocationAdded: "Location added to the message.",
  shareCopy: "Copy message",
  shareCopied: "Message copied. Paste it into any app.",
  shareCopyFailed: "Could not copy. Use WhatsApp or SMS instead.",
  shareMessage: ({ headline, ago, reportUrl, mapUrl }) =>
    [
      `StrokeSense: ${headline}.`,
      ago ? `Last known well: ${ago}.` : null,
      `Report: ${reportUrl}`,
      mapUrl ? `Location: ${mapUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
};

const hi: Dict = {
  tier: {
    emergency: {
      headline: "स्ट्रोक के चेतावनी संकेत मिले",
      advice: 'अभी आपातकालीन सेवा को कॉल करें। "संभावित स्ट्रोक" बताएं और व्यक्ति को आखिरी बार ठीक देखे जाने का समय बताएं।',
    },
    possible: {
      headline: "संभावित चेतावनी संकेत",
      advice: "ठीक होने का इंतज़ार न करें। आपातकालीन सेवा को कॉल करें और संभावित स्ट्रोक बताएं।",
    },
    inconclusive: {
      headline: "कुछ जांचें पूरी नहीं हो सकीं",
      advice:
        "अगर अचानक चेहरा लटकना, हाथ में कमज़ोरी, बोलने में दिक्कत, दिखना बंद होना या संतुलन बिगड़ना दिखे, तो तुरंत आपातकालीन सेवा को कॉल करें।",
    },
    "no-signs": {
      headline: "कोई चेतावनी संकेत नहीं मिला",
      advice: "यह जांच स्ट्रोक को पूरी तरह खारिज नहीं कर सकती। लक्षण दिखें या आप चिंतित हों, तो फिर भी आपातकालीन सेवा को कॉल करें।",
    },
  },
  finding: { abnormal: "चेतावनी संकेत", borderline: "संभावित संकेत", normal: "कोई संकेत नहीं", inconclusive: "जांच नहीं हुई" },
  test: { balance: "संतुलन", eyes: "आंखें", face: "चेहरा", arm: "हाथ", speech: "बोली" },
  side: { left: "बायां", right: "दायां" },
  explainSide: {
    face: (s) => (s ? `मुस्कुराते समय चेहरे का ${s} हिस्सा कम हिला।` : "मुस्कुराते समय चेहरे का एक हिस्सा कम हिला।"),
    arm: (s) => (s ? `${s} हाथ नीचे गिरा या ऊपर नहीं रुक सका।` : "एक हाथ नीचे गिरा या ऊपर नहीं रुक सका।"),
  },
  explain: {
    speech: "बोली अस्पष्ट हो सकती है, या कुछ शब्द गलत हो सकते हैं।",
    balance: "संतुलन में समस्या बताई गई या मापी गई।",
    eyes: "आंखों या देखने में समस्या बताई गई या मापी गई।",
  },
  normal: "इस जांच में कोई चेतावनी संकेत नहीं मिला।",
  inconclusive: "यह जांच पूरी नहीं हो सकी।",
  lastKnownWell: "आखिरी बार ठीक देखे गए",
  onsetUnknown: "पता नहीं। आपातकालीन टीम को बताएं कि व्यक्ति आखिरी बार कब सामान्य दिखे थे।",
  ago: (h, m) => (h > 0 ? `${h} घंटे ${m} मिनट पहले` : `${m} मिनट पहले`),
  onset: {
    early: "क्लॉट घोलने वाले इलाज की शुरुआती समय-सीमा अभी बाकी हो सकती है। हर मिनट कीमती है।",
    day: "कुछ इलाज अब भी संभव हो सकते हैं। बिना देर किए अस्पताल पहुंचें।",
    late: "मेडिकल टीम को ठीक-ठीक बताएं कि लक्षण कब शुरू हुए।",
  },
  callPrimary: (n) => `${n} पर कॉल करें (एम्बुलेंस)`,
  callOther: (n) => `${n} पर कॉल करें (आपातकाल)`,
  disclaimer:
    "StrokeSense केवल एक स्क्रीनिंग सहायक है, निदान नहीं। यह स्ट्रोक को चूक सकता है और गलत चेतावनी भी दे सकता है। शक हो तो हमेशा आपातकालीन सेवा को कॉल करें।",
  readAloud: "पढ़कर सुनाएं",
  noVoice: "इस डिवाइस में इस भाषा की आवाज़ उपलब्ध नहीं है।",
  firstAidTitle: "एम्बुलेंस आने तक",
  firstAid: [
    "व्यक्ति के साथ रहें। उन्हें शांत और आराम से रखें, और चलने-फिरने न दें।",
    "लक्षण शुरू होने का समय, या आखिरी बार ठीक देखे जाने का समय नोट करें और एम्बुलेंस टीम को बताएं।",
    "कोई खाना, पानी या दवा न दें, एस्पिरिन भी नहीं। निगलना सुरक्षित नहीं हो सकता।",
    "अगर वे सुस्त हों या उल्टी कर रहे हों, तो उन्हें करवट के बल लिटाएं।",
    "तंग कपड़े ढीले करें। दरवाज़ा खुला रखें और किसी को एम्बुलेंस को रास्ता दिखाने भेजें।",
    "अगर वे जवाब देना बंद कर दें या सामान्य रूप से सांस न लें, तो आपातकालीन ऑपरेटर को बताएं और उनके निर्देशों का पालन करें।",
  ],
  elapsedTitle: "आखिरी बार ठीक देखे जाने के बाद का समय",
  shareTitle: "परिवार या अस्पताल को भेजें",
  shareWhatsapp: "WhatsApp",
  shareSms: "SMS",
  shareAddLocation: "मेरी लोकेशन जोड़ें",
  shareLocating: "आपकी लोकेशन ली जा रही है…",
  shareLocationFailed: "लोकेशन नहीं मिल सकी। आप फिर भी संदेश भेज सकते हैं।",
  shareLocationAdded: "संदेश में लोकेशन जोड़ दी गई।",
  shareCopy: "संदेश कॉपी करें",
  shareCopied: "संदेश कॉपी हो गया। इसे किसी भी ऐप में पेस्ट करें।",
  shareCopyFailed: "कॉपी नहीं हो सका। WhatsApp या SMS का उपयोग करें।",
  shareMessage: ({ headline, ago, reportUrl, mapUrl }) =>
    [
      `StrokeSense: ${headline}।`,
      ago ? `आखिरी बार ठीक देखे गए: ${ago}।` : null,
      `रिपोर्ट: ${reportUrl}`,
      mapUrl ? `लोकेशन: ${mapUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
};

const ta: Dict = {
  tier: {
    emergency: {
      headline: "பக்கவாத எச்சரிக்கை அறிகுறிகள் கண்டறியப்பட்டன",
      advice: 'உடனே அவசர சேவையை அழைக்கவும். "பக்கவாதம் சந்தேகம்" என்று கூறி, அவர் கடைசியாக நலமாக இருந்த நேரத்தைத் தெரிவிக்கவும்.',
    },
    possible: {
      headline: "சாத்தியமான எச்சரிக்கை அறிகுறிகள்",
      advice: "சரியாகும் என்று காத்திருக்க வேண்டாம். அவசர சேவையை அழைத்து பக்கவாதம் இருக்கலாம் என்று கூறவும்.",
    },
    inconclusive: {
      headline: "சில சோதனைகளை முடிக்க முடியவில்லை",
      advice:
        "திடீரென முகம் தொங்குதல், கை பலவீனம், பேச்சுச் சிரமம், பார்வை இழப்பு அல்லது சமநிலை இழப்பு ஏதேனும் தெரிந்தால், உடனே அவசர சேவையை அழைக்கவும்.",
    },
    "no-signs": {
      headline: "எச்சரிக்கை அறிகுறிகள் இல்லை",
      advice: "இந்தச் சோதனை பக்கவாதத்தை முழுமையாக நிராகரிக்காது. அறிகுறிகள் தோன்றினால் அல்லது கவலையாக இருந்தால், அவசர சேவையை அழைக்கவும்.",
    },
  },
  finding: { abnormal: "எச்சரிக்கை அறிகுறி", borderline: "சாத்தியமான அறிகுறி", normal: "அறிகுறி இல்லை", inconclusive: "சோதிக்கப்படவில்லை" },
  test: { balance: "சமநிலை", eyes: "கண்கள்", face: "முகம்", arm: "கைகள்", speech: "பேச்சு" },
  side: { left: "இடது", right: "வலது" },
  explainSide: {
    face: (s) => (s ? `சிரிக்கும்போது முகத்தின் ${s} பக்கம் குறைவாக அசைந்தது.` : "சிரிக்கும்போது முகத்தின் ஒரு பக்கம் குறைவாக அசைந்தது."),
    arm: (s) => (s ? `${s} கை கீழே இறங்கியது அல்லது உயர்த்தி வைக்க முடியவில்லை.` : "ஒரு கை கீழே இறங்கியது அல்லது உயர்த்தி வைக்க முடியவில்லை."),
  },
  explain: {
    speech: "பேச்சு குழறலாக இருக்கலாம், அல்லது சில வார்த்தைகள் தவறாக இருக்கலாம்.",
    balance: "சமநிலை பிரச்சனை தெரிவிக்கப்பட்டது அல்லது அளவிடப்பட்டது.",
    eyes: "கண் அல்லது பார்வை பிரச்சனை தெரிவிக்கப்பட்டது அல்லது அளவிடப்பட்டது.",
  },
  normal: "இந்தச் சோதனையில் எச்சரிக்கை அறிகுறி எதுவும் இல்லை.",
  inconclusive: "இந்தச் சோதனையை முடிக்க முடியவில்லை.",
  lastKnownWell: "கடைசியாக நலமாக இருந்தது",
  onsetUnknown: "தெரியவில்லை. அவர் கடைசியாக எப்போது இயல்பாக இருந்தார் என்பதை அவசரக் குழுவிடம் சொல்லவும்.",
  ago: (h, m) => (h > 0 ? `${h} மணி ${m} நிமிடம் முன்பு` : `${m} நிமிடம் முன்பு`),
  onset: {
    early: "இரத்த உறைவைக் கரைக்கும் சிகிச்சைக்கான ஆரம்ப நேரம் இன்னும் இருக்கலாம். ஒவ்வொரு நிமிடமும் முக்கியம்.",
    day: "சில சிகிச்சைகள் இன்னும் சாத்தியமாக இருக்கலாம். தாமதமின்றி மருத்துவமனைக்குச் செல்லவும்.",
    late: "அறிகுறிகள் எப்போது தொடங்கின என்பதை மருத்துவக் குழுவிடம் சரியாகச் சொல்லவும்.",
  },
  callPrimary: (n) => `${n} அழைக்கவும் (ஆம்புலன்ஸ்)`,
  callOther: (n) => `${n} அழைக்கவும் (அவசரம்)`,
  disclaimer:
    "StrokeSense ஒரு முன்னோட்டப் பரிசோதனை உதவி மட்டுமே, நோயறிதல் அல்ல. இது பக்கவாதத்தைத் தவறவிடலாம் அல்லது தவறான எச்சரிக்கை தரலாம். சந்தேகம் இருந்தால் எப்போதும் அவசர சேவையை அழைக்கவும்.",
  readAloud: "சத்தமாகப் படிக்கவும்",
  noVoice: "இந்தச் சாதனத்தில் இந்த மொழிக்கான குரல் இல்லை.",
  firstAidTitle: "ஆம்புலன்ஸ் வரும் வரை",
  firstAid: [
    "அவருடன் இருங்கள். அமைதியாகவும் வசதியாகவும் வைத்திருங்கள்; நடக்க விட வேண்டாம்.",
    "அறிகுறிகள் தொடங்கிய நேரத்தை, அல்லது கடைசியாக இயல்பாக இருந்த நேரத்தைக் குறித்து ஆம்புலன்ஸ் குழுவிடம் சொல்லுங்கள்.",
    "உணவு, தண்ணீர் அல்லது மருந்து எதுவும் கொடுக்க வேண்டாம்; ஆஸ்பிரின் உட்பட. விழுங்குவது பாதுகாப்பாக இருக்காது.",
    "அவர் மயக்கமாக இருந்தால் அல்லது வாந்தி எடுத்தால், ஒருக்களித்துப் படுக்க வைக்கவும்.",
    "இறுக்கமான ஆடைகளைத் தளர்த்தவும். கதவைத் திறந்து வைத்து, ஆம்புலன்ஸுக்கு வழிகாட்ட ஒருவரை அனுப்பவும்.",
    "அவர் பதிலளிக்காமல் போனால் அல்லது சாதாரணமாக மூச்சு விடாவிட்டால், அவசர சேவை ஆபரேட்டரிடம் சொல்லி அவர்களின் வழிமுறைகளைப் பின்பற்றவும்.",
  ],
  elapsedTitle: "கடைசியாக நலமாக இருந்ததிலிருந்து கடந்த நேரம்",
  shareTitle: "குடும்பத்தினர் அல்லது மருத்துவமனைக்கு அனுப்பவும்",
  shareWhatsapp: "WhatsApp",
  shareSms: "SMS",
  shareAddLocation: "என் இருப்பிடத்தைச் சேர்",
  shareLocating: "உங்கள் இருப்பிடம் பெறப்படுகிறது…",
  shareLocationFailed: "இருப்பிடத்தைப் பெற முடியவில்லை. இருந்தாலும் செய்தியை அனுப்பலாம்.",
  shareLocationAdded: "செய்தியில் இருப்பிடம் சேர்க்கப்பட்டது.",
  shareCopy: "செய்தியை நகலெடு",
  shareCopied: "செய்தி நகலெடுக்கப்பட்டது. எந்த செயலியிலும் ஒட்டலாம்.",
  shareCopyFailed: "நகலெடுக்க முடியவில்லை. WhatsApp அல்லது SMS பயன்படுத்தவும்.",
  shareMessage: ({ headline, ago, reportUrl, mapUrl }) =>
    [
      `StrokeSense: ${headline}.`,
      ago ? `கடைசியாக நலமாக இருந்தது: ${ago}.` : null,
      `அறிக்கை: ${reportUrl}`,
      mapUrl ? `இருப்பிடம்: ${mapUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
};

export const DICTS: Record<Lang, Dict> = { en, hi, ta };

/** Plain-language, family-facing explanation of one test result. */
export function explainResult(r: Pick<TestResult, "test" | "finding" | "weakerSide">, lang: Lang): string {
  const d = DICTS[lang];
  if (r.finding === "normal") return d.normal;
  if (r.finding === "inconclusive") return d.inconclusive;
  if (r.test === "face" || r.test === "arm") return d.explainSide[r.test](r.weakerSide ? d.side[r.weakerSide] : null);
  return d.explain[r.test];
}
