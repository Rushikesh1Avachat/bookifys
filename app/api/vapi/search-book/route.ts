// ✅ VERY IMPORTANT: prevent build-time execution
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { searchBookSegments } from '@/lib/actions/book.actions';

// Helper function to process book search logic
async function processBookSearch(bookId: unknown, query: unknown) {
    try {
        // Validate inputs before conversion
        if (bookId == null || query == null || query === '') {
            return { result: 'Missing bookId or query' };
        }

        // Convert to string safely
        const bookIdStr = String(bookId);
        const queryStr = String(query).trim();

        // Validate again
        if (
            !bookIdStr ||
            bookIdStr === 'null' ||
            bookIdStr === 'undefined' ||
            !queryStr
        ) {
            return { result: 'Missing bookId or query' };
        }

        // ✅ Call DB logic only at runtime
        const searchResult = await searchBookSegments(bookIdStr, queryStr, 3);

        if (!searchResult?.success || !searchResult?.data?.length) {
            return {
                result: 'No information found about this topic in the book.',
            };
        }

        // Combine content
        const combinedText = searchResult.data
            .map((segment: any) => segment.content)
            .join('\n\n');

        return { result: combinedText };
    } catch (error) {
        console.error('processBookSearch error:', error);
        return { result: 'Error processing search' };
    }
}

// Health check
export async function GET() {
    return NextResponse.json({ status: 'ok' });
}

// Parse tool arguments safely
function parseArgs(args: unknown): Record<string, unknown> {
    if (!args) return {};

    if (typeof args === 'string') {
        try {
            return JSON.parse(args);
        } catch {
            return {};
        }
    }

    return args as Record<string, unknown>;
}

// Main POST handler
export async function POST(request: Request) {
    try {
        const body = await request.json();

        console.log(
            'Vapi search-book request:',
            JSON.stringify(body, null, 2)
        );

        const functionCall = body?.message?.functionCall;
        const toolCallList =
            body?.message?.toolCallList || body?.message?.toolCalls;

        // ✅ Handle single function call
        if (functionCall) {
            const { name, parameters } = functionCall;
            const parsed = parseArgs(parameters);

            if (name === 'searchBook') {
                const result = await processBookSearch(
                    parsed.bookId,
                    parsed.query
                );
                return NextResponse.json(result);
            }

            return NextResponse.json({
                result: `Unknown function: ${name}`,
            });
        }

        // ✅ Handle tool call array
        if (!toolCallList || toolCallList.length === 0) {
            return NextResponse.json({
                results: [{ result: 'No tool calls found' }],
            });
        }

        const results = [];

        for (const toolCall of toolCallList) {
            const { id, function: func } = toolCall;
            const name = func?.name;
            const args = parseArgs(func?.arguments);

            if (name === 'searchBook') {
                const searchResult = await processBookSearch(
                    args.bookId,
                    args.query
                );

                results.push({
                    toolCallId: id,
                    ...searchResult,
                });
            } else {
                results.push({
                    toolCallId: id,
                    result: `Unknown function: ${name}`,
                });
            }
        }

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Vapi search-book error:', error);

        return NextResponse.json({
            results: [{ result: 'Error processing request' }],
        });
    }
}