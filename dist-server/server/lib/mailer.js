import nodemailer from "nodemailer";
import { config } from "../config.js";
let transporter = null;
export function mailerConfigured() {
    return Boolean(process.env.SMTP_URL);
}
function transport() {
    const value = process.env.SMTP_URL;
    if (!value)
        return null;
    if (!transporter) {
        const url = new URL(value);
        const secure = url.protocol === "smtps:" || url.searchParams.get("secure") === "true";
        transporter = nodemailer.createTransport({
            host: url.hostname,
            port: Number(url.port) || (secure ? 465 : 587),
            secure,
            auth: url.username
                ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
                : undefined,
            connectionTimeout: 15_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000
        });
    }
    return transporter;
}
export async function sendMail(message) {
    let client;
    try {
        client = transport();
    }
    catch (error) {
        return {
            status: "failed",
            provider: "smtp",
            error: error instanceof Error ? `SMTP_URL could not be read: ${error.message}` : "SMTP_URL could not be read."
        };
    }
    if (!client) {
        return {
            status: "not_configured",
            provider: "smtp",
            error: "SMTP_URL is not configured."
        };
    }
    if (!config.integrations.smtpFrom) {
        return {
            status: "failed",
            provider: "smtp",
            error: "SMTP_FROM is not configured."
        };
    }
    try {
        const info = await client.sendMail({
            from: config.integrations.smtpFrom,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            replyTo: message.replyTo,
            attachments: message.attachments
        });
        if (!info.accepted || info.accepted.length === 0) {
            return {
                status: "failed",
                provider: "smtp",
                error: "The SMTP server did not accept the recipient."
            };
        }
        return { status: "sent", provider: "smtp" };
    }
    catch (error) {
        return {
            status: "failed",
            provider: "smtp",
            error: error instanceof Error ? error.message.slice(0, 600) : "The SMTP server rejected the message."
        };
    }
}
