import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { toast } from "sonner";

import { AuthService } from "~/services/auth.service.server";

import { Field, FieldLabel, FieldError, FieldGroup } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

// --------------------------------------------------
// Zod Schema
// --------------------------------------------------
const loginSchema = z.object({
	email: z.string().min(1, "Email is required").email("Please enter a valid email"),
	password: z.string().min(1, "Password is required").min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// --------------------------------------------------
// Loader – redirect if already logged in
// --------------------------------------------------
export async function loader({ request }: LoaderFunctionArgs) {
	const auth = new AuthService(request);
	const { data: user } = await auth.getUser();

	if (user) {
		return redirect("/");
	}

	return null;
}

export const meta = () => {
	return [
		{
			title: "Login | LedgerPilot",
		},
	];
};

// --------------------------------------------------
// Action
// --------------------------------------------------
export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData();
	const email = String(formData.get("email") || "")
		.toLowerCase()
		.trim();
	const password = String(formData.get("password") || "").trim();

	const parsed = loginSchema.safeParse({ email, password });

	if (!parsed.success) {
		return {
			ok: false,
			message: "Validation failed",
			errors: parsed.error.flatten().fieldErrors,
		};
	}

	const auth = new AuthService(request);
	const { error } = await auth.signInWithPassword({
		email: parsed.data.email,
		password: parsed.data.password,
	});

	if (error) {
		return {
			ok: false,
			message: error.message || "Invalid email or password",
		};
	}

	return redirect("/", {
		headers: auth.headers,
	});
}

// --------------------------------------------------
// Component
// --------------------------------------------------
export default function LoginPage() {
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	const {
		register,
		formState: { errors },
	} = useForm<LoginFormValues>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	// Toast on error from action
	useEffect(() => {
		if (actionData && !actionData.ok) {
			toast.error(actionData.message || "Something went wrong");
		}
	}, [actionData]);

	return (
		<div className="min-h-screen flex">
			{/* Left side – subtle background */}
			<div className="hidden lg:flex lg:w-1/2 bg-muted items-center justify-center p-12">
				<div className="max-w-md space-y-4">
					<h1 className="text-3xl font-semibold tracking-tight">LedgerPilot</h1>
					<p className="text-muted-foreground text-lg">
						Your AI finance assistant for PayPal. Reconcile payments, catch anomalies, and stay in
						control.
					</p>
				</div>
			</div>

			{/* Right side – form */}
			<div className="flex-1 flex items-center justify-center p-6 sm:p-12">
				<Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-sm">
					<CardHeader className="space-y-1">
						<CardTitle className="text-2xl">Sign in</CardTitle>
						<CardDescription>Enter your email and password to continue</CardDescription>
					</CardHeader>

					<CardContent>
						<Form method="post" className="space-y-6">
							<FieldGroup>
								{/* Email */}
								<Field data-invalid={!!errors.email}>
									<FieldLabel htmlFor="email">Email</FieldLabel>
									<Input
										id="email"
										type="email"
										placeholder="you@example.com"
										autoComplete="email"
										disabled={isSubmitting}
										aria-invalid={!!errors.email}
										{...register("email")}
									/>
									{errors.email && <FieldError>{errors.email.message}</FieldError>}
								</Field>

								{/* Password */}
								<Field data-invalid={!!errors.password}>
									<FieldLabel htmlFor="password">Password</FieldLabel>
									<Input
										id="password"
										type="password"
										placeholder="••••••••"
										autoComplete="current-password"
										disabled={isSubmitting}
										aria-invalid={!!errors.password}
										{...register("password")}
									/>
									{errors.password && <FieldError>{errors.password.message}</FieldError>}
								</Field>
							</FieldGroup>

							<Button type="submit" className="w-full" disabled={isSubmitting}>
								{isSubmitting ? "Signing in…" : "Sign in"}
							</Button>
						</Form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
