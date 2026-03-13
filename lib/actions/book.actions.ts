'use server';


import {CreateBook, TextSegment} from "@/types";
import {connectToDatabase} from "@/database/mongoose";
import {generateSlug, serializeData} from "@/lib/utils";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";


export const checkBookExists = async (title: string) => {
    try {
        await connectToDatabase();

        const slug = generateSlug(title);

        const existingBook = await Book.findOne({slug}).lean();

        if(existingBook) {
            return {
                exists: true,
                book: serializeData(existingBook)
            }
        }

        return {
            exists: false,
        }
    } catch (e) {
        console.error('Error checking book exists', e);
        return {
            exists: false, error: e
        }
    }
}
export const createBook = async (data: CreateBook) => {
    try {
        await connectToDatabase();

        const slug = generateSlug(data.title);

        const existingBook = await Book.findOne({slug}).lean();

        if(existingBook) {
            return {
                success: true,
                data: serializeData(existingBook),
                alreadyExists: true,
            }
        }

        // Todo: Check subscription limits before creating a book
        const { getUserPlan } = await import("@/lib/subscription.server");
        const { PLAN_LIMITS } = await import("@/lib/subscription-constants");

        const { auth } = await import("@clerk/nextjs/server");
        const { userId } = await auth();

        if (!userId || userId !== data.clerkId) {
            return { success: false, error: "Unauthorized" };
        }

        const plan = await getUserPlan();
        const limits = PLAN_LIMITS[plan];

        const bookCount = await Book.countDocuments({ clerkId: userId });

        if (bookCount >= limits.maxBooks) {
            const { revalidatePath } = await import("next/cache");
            revalidatePath("/");

            return {
                success: false,
                error: `You have reached the maximum number of books allowed for your ${plan} plan (${limits.maxBooks}). Please upgrade to add more books.`,
                isBillingError: true,
            };
        }

        const book = await Book.create({...data, clerkId: userId, slug, totalSegments: 0});

        return {
            success: true,
            data: serializeData(book),
        }
    } catch (e) {
        console.error('Error creating a book', e);

        return {
            success: false,
            error: e,
        }
    }
}
export const saveBookSegments = async (bookId: string, clerkId: string, segments: TextSegment[]) => {
    try {
        await connectToDatabase();

        console.log('Saving book segments...');

        const segmentsToInsert = segments.map(({ text, segmentIndex, pageNumber, wordCount }) => ({
            clerkId, bookId, content: text, segmentIndex, pageNumber, wordCount
        }));

        await BookSegment.insertMany(segmentsToInsert);

        await Book.findByIdAndUpdate(bookId, { totalSegments: segments.length });

        console.log('Book segments saved successfully.');

        return {
            success: true,
            data: { segmentsCreated: segments.length}
        }
    } catch (e) {
        console.error('Error saving book segments', e);

        return {
            success: false,
            error: e,
        }
    }
}