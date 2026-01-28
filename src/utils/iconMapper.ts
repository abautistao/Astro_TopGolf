// src/utils/iconMapper.ts



export const lottieMap: Record<string, string> = {
    "social": "/lottie/Social.json",
    "pricing": "/lottie/Pricing.json",
    "games": "/lottie/Games.json",
    "festive": "/lottie/Festive.json",
    "more fun": "/lottie/More_Fun.json",
    "whats on": "/lottie/Whats_On.json",
    "spaces": "/lottie/Spaces.json",
    "faqs": "/lottie/FAQs.json",
    "enquire": "/lottie/Enquire.json",
    "corporate": "/lottie/Corporate.json",
    "birthday": "/lottie/birthday.json",
    "animation": "/lottie/Animation-1755619336176.lottie",
};



export const getLottiePath = (strapiIconName: string | null | undefined): string | null => {
    if (!strapiIconName) return null;
    const key = strapiIconName.toLowerCase().trim();
    return lottieMap[key] || null;
};