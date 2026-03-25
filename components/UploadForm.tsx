'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, ImageIcon } from 'lucide-react';

import { UploadSchema } from '@/lib/zod';
import { BookUploadFormValues } from '@/types';

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import {
    ACCEPTED_PDF_TYPES,
    ACCEPTED_IMAGE_TYPES,
    DEFAULT_VOICE,
} from '@/lib/constants';

import FileUploader from './FileUploader';
import VoiceSelector from './VoiceSelector';
import LoadingOverlay from './LoadingOverlay';

import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
import {
    checkBookExists,
    createBook,
    saveBookSegments,
} from '@/lib/actions/book.actions';

import { useRouter } from 'next/navigation';
import { parsePDFFile } from '@/lib/utils';
import { upload } from '@vercel/blob/client';


// ✅ SAFE ERROR HELPER
const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
};

const UploadForm = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const { userId } = useAuth();
    const router = useRouter();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const form = useForm<BookUploadFormValues>({
        resolver: zodResolver(UploadSchema),
        defaultValues: {
            title: '',
            author: '',
            persona: DEFAULT_VOICE, // ✅ fixed
            pdfFile: undefined,
            coverImage: undefined,
        },
    });

    const onSubmit = async (data: BookUploadFormValues) => {
        if (!userId) {
            return toast.error('Please login to upload books');
        }

        // ✅ PDF safety check
        if (!data.pdfFile) {
            return toast.error('Please upload a PDF file');
        }

        setIsSubmitting(true);

        try {
            // ✅ Check existing book
            const existsCheck = await checkBookExists(data.title);

            if (existsCheck.exists && existsCheck.book) {
                toast.info('Book already exists');
                form.reset();
                router.push(`/books/${existsCheck.book.slug}`);
                return;
            }

            const fileTitle = data.title.replace(/\s+/g, '-').toLowerCase();
            const pdfFile = data.pdfFile;

            // ✅ Parse PDF
            const parsedPDF = await parsePDFFile(pdfFile);

            if (!parsedPDF.content?.length) {
                toast.error('Failed to parse PDF');
                return;
            }

            // ✅ Upload PDF
            const uploadedPdfBlob = await upload(fileTitle, pdfFile, {
                access: 'public',
                handleUploadUrl: '/api/upload',
                contentType: 'application/pdf',
            });

            // ✅ Upload Cover
            let coverUrl: string;

            if (data.coverImage) {
                const uploadedCoverBlob = await upload(
                    `${fileTitle}_cover.png`,
                    data.coverImage,
                    {
                        access: 'public',
                        handleUploadUrl: '/api/upload',
                        contentType: data.coverImage.type,
                    }
                );
                coverUrl = uploadedCoverBlob.url;
            } else {
                const response = await fetch(parsedPDF.cover);
                const blob = await response.blob();

                const uploadedCoverBlob = await upload(
                    `${fileTitle}_cover.png`,
                    blob,
                    {
                        access: 'public',
                        handleUploadUrl: '/api/upload',
                        contentType: 'image/png',
                    }
                );

                coverUrl = uploadedCoverBlob.url;
            }

            // ✅ Create Book
            const book = await createBook({
                clerkId: userId,
                title: data.title,
                author: data.author,
                persona: data.persona,
                fileURL: uploadedPdfBlob.url,
                fileBlobKey: uploadedPdfBlob.pathname,
                coverURL: coverUrl,
                fileSize: pdfFile.size,
            });

            // ✅ Safe error handling
            if (!book.success) {
                const message =
                    book.error instanceof Error
                        ? book.error.message
                        : String(book.error || 'Failed to create book');

                toast.error(message);

                if (book.isBillingError) {
                    router.push('/subscriptions');
                }
                return;
            }

            // ✅ Already exists
            if (book.alreadyExists) {
                toast.info('Book already exists');
                form.reset();
                router.push(`/books/${book.data.slug}`);
                return;
            }

            // ✅ Save segments
            const segments = await saveBookSegments(
                book.data._id,
                userId,
                parsedPDF.content
            );

            if (!segments.success) {
                throw new Error('Failed to save book segments');
            }

            // ✅ SUCCESS
            toast.success('Book uploaded successfully 🎉');

            form.reset();
            router.push('/');
        } catch (error) {
            console.error(error);
            toast.error(getErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isMounted) return null;

    return (
        <>
            {isSubmitting && <LoadingOverlay />}

            <div className="new-book-wrapper max-w-4xl mx-auto p-6">
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-8"
                    >
                        {/* PDF Upload */}
                        <FileUploader
                            control={form.control}
                            name="pdfFile"
                            label="Book PDF File"
                            acceptTypes={ACCEPTED_PDF_TYPES}
                            icon={Upload}
                            placeholder="Click to upload PDF"
                            hint="PDF file (max 50MB)"
                            disabled={isSubmitting}
                        />

                        {/* Cover Upload */}
                        <FileUploader
                            control={form.control}
                            name="coverImage"
                            label="Cover Image"
                            acceptTypes={ACCEPTED_IMAGE_TYPES}
                            icon={ImageIcon}
                            placeholder="Click to upload cover image"
                            hint="Leave empty to auto-generate"
                            disabled={isSubmitting}
                        />

                        {/* Title */}
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="form-label">Title</FormLabel>
                                    <FormControl>
                                        <Input
                                            className="form-input"
                                            placeholder="ex: Rich Dad Poor Dad"
                                            {...field}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Author */}
                        <FormField
                            control={form.control}
                            name="author"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="form-label">
                                        Author Name
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            className="form-input"
                                            placeholder="ex: Robert Kiyosaki"
                                            {...field}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Voice */}
                        <FormField
                            control={form.control}
                            name="persona"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="form-label">
                                        Choose Assistant Voice
                                    </FormLabel>
                                    <FormControl>
                                        <VoiceSelector
                                            value={field.value}
                                            onChange={field.onChange}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Submit */}
                        <Button
                            type="submit"
                            className="form-btn w-full text-lg py-6"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Processing...' : 'Begin Synthesis'}
                        </Button>
                    </form>
                </Form>
            </div>
        </>
    );
};

export default UploadForm;
