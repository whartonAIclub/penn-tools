// Photos for the sample trips, from Wikimedia Commons, resized to 800px wide.
// Their licenses ask for credit, which each card shows under More details.

import bayArea from "./images/bay-area.jpg";
import brazil from "./images/brazil-gip.jpg";
import europe from "./images/europe-gmc.jpg";
import iceland from "./images/iceland.jpg";
import india from "./images/india-gip.jpg";
import japan from "./images/japan.jpg";
import jordan from "./images/jordan.jpg";
import kenya from "./images/kenya.jpg";
import morocco from "./images/morocco.jpg";
import newZealand from "./images/new-zealand.jpg";
import nyc from "./images/nyc-finance.jpg";
import patagonia from "./images/patagonia.jpg";

const COMMONS = "https://commons.wikimedia.org/wiki/File:";
const CC0 = { license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
const BY_2 = { license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0" };
const BY_SA_2 = { license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0" };
const BY_SA_3 = { license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0" };
const BY_SA_4 = { license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" };

/** A sample trip's photo and where it came from. */
export interface SamplePhoto {
  url: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** The page the photo came from. */
  source: string;
}

/** Each sample trip's photo, by trip ID. */
export const SAMPLE_PHOTOS: Record<string, SamplePhoto> = {
  "sample-patagonia": {
    url: patagonia.src,
    author: "Pedro Szekely",
    ...BY_SA_2,
    source: `${COMMONS}Cuernos_del_Paine_in_Torres_del_Paine_National_Park.jpg`,
  },
  "sample-india-gip": {
    url: india.src,
    author: "Joe Ravi",
    ...BY_SA_3,
    source: `${COMMONS}Gateway_Of_India.jpg`,
  },
  "sample-iceland": {
    url: iceland.src,
    author: "Carl Young",
    ...BY_SA_4,
    source: `${COMMONS}Iceland_Aurora_6.jpg`,
  },
  "sample-japan": {
    url: japan.src,
    author: "Basile Morin",
    ...BY_SA_4,
    source: `${COMMONS}Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg`,
  },
  "sample-morocco": {
    url: morocco.src,
    author: "Schorle",
    ...BY_SA_4,
    source: `${COMMONS}Koutoubia_minaret_from_the_city.JPG`,
  },
  "sample-jordan": {
    url: jordan.src,
    author: "Esin Üstün",
    ...BY_2,
    source: `${COMMONS}Treasury_from_Siq,_Petra,_Jordan_(16044613195).jpg`,
  },
  "sample-bay-area": {
    url: bayArea.src,
    author: "Frank Schulenburg",
    ...BY_SA_4,
    source: `${COMMONS}Golden_Gate_Bridge_as_seen_from_Marshall%E2%80%99s_Beach,_March_2018.jpg`,
  },
  "sample-europe-gmc": {
    url: europe.src,
    author: "Terragio67",
    ...BY_SA_4,
    source: `${COMMONS}The_glass_dome_-_Galleria_Vittorio_Emanuele_II_-_Milan.jpg`,
  },
  "sample-new-zealand": {
    url: newZealand.src,
    author: "Marian Predescu",
    ...CC0,
    source: `${COMMONS}Mitre_Peak_Milford_Sound_(263481037).jpeg`,
  },
  "sample-kenya": {
    url: kenya.src,
    author: "Volodymyr Burdiak",
    ...BY_SA_4,
    source: `${COMMONS}Three_zebras_in_Masai_Mara_National_Park,_Kenya.jpg`,
  },
  "sample-brazil-gip": {
    url: brazil.src,
    author: "Wilfredor",
    ...CC0,
    source: `${COMMONS}Rio_de_Janeiro_skyline_and_Sugarloaf_Mountain_at_sunset,_Brazil_3.jpg`,
  },
  "sample-nyc-finance": {
    url: nyc.src,
    author: "King of Hearts",
    ...BY_SA_4,
    source: `${COMMONS}Lower_Manhattan_from_Jersey_City_November_2016_002.jpg`,
  },
};
