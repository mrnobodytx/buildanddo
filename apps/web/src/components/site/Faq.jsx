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
            'BuildAndDo is an early-stage educational collaboration platform where people and AI learn by doing real things together. Choose an objective, explore a lesson or method, collaborate on the work, preserve the evidence, check the result, and share what you learned.',
    },
    {
        question: 'Is BuildAndDo a chatbot?',
        answer:
            'The assistant is one collaborator in a shared workspace. Lessons, classrooms, projects, missions and practices connect the conversation to real work. You can inspect the recorded actions and evidence, reflect on the result, and reuse a method with its review status attached.',
    },
    {
        question: 'Does it take actions automatically?',
        answer:
            'An executable workflow needs an approved scope and an available, authorized tool. You review the plan before effects occur. A saved objective, lesson completion or assistant suggestion does not grant execution authority or verify a result.',
    },
    {
        question: 'Who is BuildAndDo for?',
        answer:
            'Learners, educators, builders, researchers and teams working toward a real objective. Projects can involve software, research, entrepreneurship, business operations, community work, creative work or proposal preparation. People, AI and community collaborators use the same learning and evidence loop.',
    },
    {
        question: 'Do I need technical skills?',
        answer:
            'You can start with a plain-language objective and a lesson or practice. The project determines which skills, tools and collaborators you need. Some projects involve code; others involve research, planning or hands-on work.',
    },
    {
        question: 'What happens to my project data?',
        answer:
            'BuildAndDo is an early MVP and we are still finalizing our data practices, so we won\u2019t make claims we can\u2019t back up yet. The product is designed around observable state — you can see what it knows and what it did. We will publish full privacy details before launch, and early-access sign-ups are only used to contact you about the product.',
    },
    {
        question: 'Is BuildAndDo available now?',
        answer:
            'BuildAndDo is in early access. Explore the public lessons and practices, or join the early-access list with something you want to learn, build or accomplish. A listed tool or proposed practice still needs its own availability and evidence checks.',
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
                        A starting point for learners, collaborators and project teams.
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
