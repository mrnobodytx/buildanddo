import React from 'react';
import { Section, SectionLabel } from '@/components/site/ui';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { PURPOSE } from '@/lib/purpose';

export const FAQ_ITEMS = [
    {
        question: 'What is BuildAndDo?',
        answer:
            `${PURPOSE.summary} Eight guilds, each led by an automated guildmaster agent, cover fields from building and research to writing and commerce.`,
    },
    {
        question: 'Is BuildAndDo a chatbot?',
        answer:
            'No. You can describe what you want to learn or build in plain English, but BuildAndDo is not an open-ended chatbot. It turns what you describe into a bounded mission with a clear goal and scope, and it shows you the evidence when the mission is done.',
    },
    {
        question: 'Does it take actions automatically?',
        answer:
            'Only within limits you approve. BuildAndDo separates observing information, simulating a possible action, and executing an approved action. You review the plan first, and the final say stays with you.',
    },
    {
        question: 'Who is BuildAndDo for?',
        answer:
            'People who learn best by doing: learners, teams and builders who want to work through a real project together, with other people and with AI agents. Beginners are welcome, and so are experienced builders who want a verified record of what they made. One real question is enough to start.',
    },
    {
        question: 'Do I need technical skills?',
        answer:
            'No. BuildAndDo is designed for beginners. You describe what you want in plain English and it handles the structure underneath. There is nothing to code and no AI terminology to learn.',
    },
    {
        question: 'What happens to my data?',
        answer:
            'BuildAndDo is in early access and we are still finalizing our data practices, so we won’t make claims we can’t back up yet. The platform is designed around observable state — you can see what it knows and what it did. Talking to Buddi, our voice agent, sends what you say to ElevenLabs, our voice provider, where it may be recorded. We will publish full privacy details before launch, and early-access sign-ups are only used to contact you about BuildAndDo.',
    },
    {
        question: 'Is BuildAndDo available now?',
        answer:
            'BuildAndDo is in early access. We are working with a first group of learners and builders to shape the platform around real projects. Join the early-access list and tell us what you want to learn or build first.',
    },
];

export default function Faq() {
    return (
        <Section id="faq">
            <div className="mx-auto max-w-3xl">
                <div className="text-center">
                    <SectionLabel className="justify-center">FAQ</SectionLabel>
                    <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                        Direct answers, no hype
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        The questions a first-time member would actually ask.
                    </p>
                </div>

                <div className="mt-10 divide-y divide-border rounded-[var(--radius)] border border-border bg-card">
                    <Accordion type="single" collapsible className="px-5">
                        {FAQ_ITEMS.map((item, i) => (
                            <AccordionItem
                                key={item.question}
                                value={`item-${i}`}
                                className="border-0"
                            >
                                <AccordionTrigger className="py-5 text-left font-display text-base font-semibold hover:text-primary hover:no-underline sm:text-lg">
                                    {item.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                                    {item.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </Section>
    );
}
