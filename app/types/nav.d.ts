export interface NavSubItem {
	title: string;
	url: string;
	icon: JSX.Element;
}

export interface NavItem {
	title: string;
	items: NavSubItem[];
}
