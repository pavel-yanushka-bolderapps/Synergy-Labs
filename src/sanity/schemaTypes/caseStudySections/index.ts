// The case-study page builder. Each of these is one section an editor can
// add to a case study, in any order and any number of times -- see the
// `sections` field in ../projects.ts and the renderer in
// src/components/sections/casestudy/Sections.astro.
//
// Adding a section type means three files: a schema here, a component in
// src/components/sections/casestudy/, and an entry in that renderer's map.
import { splitBlock } from "./splitBlock";
import { featureGrid } from "./featureGrid";
import { showcase } from "./showcase";
import { statsBand } from "./statsBand";
import { testimonial } from "./testimonial";

export const caseStudySections = [splitBlock, featureGrid, showcase, statsBand, testimonial];

/** The `of:` list for the `sections` array, in the order the Studio offers them. */
export const caseStudySectionRefs = caseStudySections.map((s) => ({ type: s.name }));
