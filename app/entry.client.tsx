import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import {
	AllCommunityModule as CAllCommunityModule,
	ModuleRegistry as CModuleRegistry,
} from "ag-charts-community";
ModuleRegistry.registerModules([AllCommunityModule]);
CModuleRegistry.registerModules([CAllCommunityModule]);

startTransition(() => {
	hydrateRoot(document, <HydratedRouter />);
});
