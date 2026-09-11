// CGRF: SRS=SRS-BUILDANDDO-PURPOSE-001 | CAPS=B | Seat=C-ONE
import React from 'react';
import { Section, SectionLabel } from '@/components/site/ui';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';

export const FAQ_ITEMS = [
    {
        question: 'What is BuildAndDo?',
        answer:
            'BuildAndDo is an educational, collaborative platform. You learn by doing real, verified work together with Citadel Nexus guilds and agents: pick an objective, work it in bounded steps, and keep a receipt for what was actually verified. It is early-stage software, and it says so wherever a feature is not there yet.',
    },
    {
        question: 'Is BuildAndDo a chatbot?',
        answer:
            'No. You describe what you want to learn or build in plain English, but BuildAndDo is not an open-ended chatbot. It turns what you describe into a bounded mission with a clear goal and scope, works it with you and your guild, and shows you the evidence when the mission is done.',
    },
    {
        question: 'Does it take actions automatically?',
        answer:
            'Only within limits you approve. BuildAndDo separates observing information, simulating a possible action, and executing an approved action. You review the plan first, and the final say stays with you.',
    },
    {
        question: 'Who is BuildAndDo for?',
        answer:
            'Learners, builders and collaborators who want to practise real work with real feedback — students, self-taught developers, researchers, and anyone joining a Citadel Nexus guild. Beginners can use the same loop to turn a plain-English idea into a structured, testable piece of work.',
    },
    {
        question: 'Do I need technical skills to start?',
        answer:
            'No. You describe the objective in plain English and BuildAndDo handles the structure underneath. What you learn along the way — including code, if that is what your objective needs — is the point; there is no AI terminology to learn first.',
    },
    {
        question: 'What happens to my data and my work?',
        answer:
            'BuildAndDo is an early MVP and we are still finalizing our data practices, so we won\u2019t make claims we can\u2019t back up yet. The product is designed around observable state — you can see what it knows and what it did. We will publish full privacy details before launch, and early-access sign-ups are only used to contact you about the product.',
    },
    {
        question: 'Is BuildAndDo available now?',
        answer:
            'BuildAndDo is in early access. We are working with a first group of learners and guild collaborators to shape the platform around real objectives. Join the early-access list and describe what you want to learn to do.',
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
                        The questions a first-time learner or collaborator would actually ask.
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
