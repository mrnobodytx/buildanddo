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
            'BuildAndDo is early-stage software for small-business owners. It helps you notice important changes in your business, understand them in plain language, approve a bounded mission, and verify what happened — so you get operational help without automation jargon.',
    },
    {
        question: 'Is BuildAndDo a chatbot?',
        answer:
            'No. You describe problems in plain English, but BuildAndDo is not an open-ended chatbot. It turns what you describe into a bounded mission with a clear goal and scope, and it shows you the evidence when the mission is done.',
    },
    {
        question: 'Does it take actions automatically?',
        answer:
            'Only within limits you approve. BuildAndDo separates observing information, simulating a possible action, and executing an approved action. You review the plan first, and the final say stays with you.',
    },
    {
        question: 'Who is BuildAndDo for?',
        answer:
            'Primarily small-business owners and operators — especially appointment-based and service businesses like salons, consultants, and local providers. Beginners and vibe coders can also use the same loop to turn plain-English ideas into structured, testable workflows.',
    },
    {
        question: 'Do I need technical skills?',
        answer:
            'No. BuildAndDo is designed for nontechnical operators. You describe the problem in plain English and it handles the structure underneath. There is nothing to code and no AI terminology to learn.',
    },
    {
        question: 'What happens to my business data?',
        answer:
            'BuildAndDo is an early MVP and we are still finalizing our data practices, so we won\u2019t make claims we can\u2019t back up yet. The product is designed around observable state — you can see what it knows and what it did. We will publish full privacy details before launch, and early-access sign-ups are only used to contact you about the product.',
    },
    {
        question: 'Is BuildAndDo available now?',
        answer:
            'BuildAndDo is in early access. We are working with a first group of small-business owners to shape the product around real problems. Join the early-access list and describe the repetitive task you would want help with.',
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
                        The questions a first-time business owner would actually ask.
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
