import { useEffect, useRef, useState } from "react";
import LoadingBar, { type LoadingBarRef } from "react-top-loading-bar";
import { useLocation, useNavigation } from "react-router";

export const TopLoadingBar = () => {
	const loadingBarRef = useRef<null | LoadingBarRef>(null);
	const navigation = useNavigation();
	const [isLoadingBarStarted, setIsLoadingBarStarted] = useState<boolean>(false);
	const [mounted, setMounted] = useState(false);

	const location = useLocation();

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (loadingBarRef.current == null || !loadingBarRef.current || !mounted) return;

		if (navigation.state === "loading") {
			if (!location?.state?.suppressLoadingBar) {
				// Start the loading bar for non-suppressed navigations
				loadingBarRef.current.continuousStart();
				setIsLoadingBarStarted(true);
			} else {
				// Ensure suppressed navigations don't start the bar
				setIsLoadingBarStarted(false);
			}
		} else if (navigation.state === "idle" && isLoadingBarStarted) {
			// Only complete the bar if it was started
			loadingBarRef.current.complete();
			setIsLoadingBarStarted(false);
		}
	}, [navigation.state, navigation.location, isLoadingBarStarted, mounted]);

	if (!mounted) return null;

	return <LoadingBar color="var(--color-primary)" height={4} ref={loadingBarRef} />;
};
