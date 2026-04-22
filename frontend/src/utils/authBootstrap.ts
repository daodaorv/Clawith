function normalizePathname(pathname: string): string {
    if (!pathname) return '/';
    if (pathname.length > 1 && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }
    return pathname;
}

export function shouldBootstrapAuthSession(pathname: string): boolean {
    return normalizePathname(pathname) !== '/reset-password';
}
