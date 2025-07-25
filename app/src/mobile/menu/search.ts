import {closePanel} from "../util/closePanel";
import {getCurrentEditor, openMobileFileById} from "../editor";
import {Constants} from "../../constants";
import {fetchPost} from "../../util/fetch";
import {getIconByType} from "../../editor/getIcon";
import {preventScroll} from "../../protyle/scroll/preventScroll";
import {openModel} from "./model";
import {getDisplayName, getNotebookIcon, getNotebookName, movePathTo, pathPosix} from "../../util/pathName";
import {getKeyByLiElement, initCriteriaMenu, moreMenu} from "../../search/menu";
import {setStorageVal} from "../../protyle/util/compatibility";
import {escapeGreat, escapeHtml} from "../../util/escape";
import {unicode2Emoji} from "../../emoji";
import {newFileByName} from "../../util/newFile";
import {showMessage} from "../../dialog/message";
import {reloadProtyle} from "../../protyle/util/reload";
import {activeBlur} from "../util/keyboardToolbar";
import {App} from "../../index";
import {
    assetFilterMenu,
    assetInputEvent,
    assetMethodMenu,
    assetMoreMenu,
    renderNextAssetMark,
    renderPreview,
} from "../../search/assets";
import {addClearButton} from "../../util/addClearButton";
import {checkFold} from "../../util/noRelyPCFunction";
import {getDefaultType} from "../../search/getDefault";
import {
    saveAssetKeyList,
    saveKeyList,
    toggleAssetHistory,
    toggleReplaceHistory,
    toggleSearchHistory
} from "../../search/toggleHistory";

const replace = (element: Element, config: Config.IUILayoutTabSearchConfig, isAll: boolean) => {
    if (config.method === 2) {
        showMessage(window.siyuan.languages._kernel[132]);
        return;
    }
    const searchListElement = element.querySelector("#searchList");
    const replaceInputElement = element.querySelector("#toolbarReplace") as HTMLInputElement;

    const loadElement = replaceInputElement.parentElement.querySelector(".fn__rotate");
    if (!loadElement.classList.contains("fn__none")) {
        return;
    }
    saveKeyList("replaceKeys", replaceInputElement.value);
    const currentLiElement: HTMLElement = searchListElement.querySelector(".b3-list-item--focus");
    if (!currentLiElement) {
        return;
    }
    loadElement.classList.remove("fn__none");
    loadElement.nextElementSibling.classList.add("fn__none");
    const currentId = currentLiElement.getAttribute("data-node-id");
    fetchPost("/api/search/findReplace", {
        k: config.method === 0 || config.method === 1 ? getKeyByLiElement(currentLiElement) : (document.querySelector("#toolbarSearch") as HTMLInputElement).value,
        r: replaceInputElement.value,
        ids: isAll ? [] : [currentId],
        types: config.types,
        method: config.method,
        replaceTypes: config.replaceTypes,
        paths: config.idPath || [],
        groupBy: config.group,
        orderBy: config.sort,
        page: config.page,
    }, (response) => {
        loadElement.classList.add("fn__none");
        loadElement.nextElementSibling.classList.remove("fn__none");

        if (response.code === 1) {
            showMessage(response.msg);
            return;
        }
        if (isAll) {
            updateSearchResult(config, element, false);
            return;
        }
        reloadProtyle(window.siyuan.mobile.editor.protyle, false);

        let newId = currentLiElement.getAttribute("data-node-id");
        if (currentLiElement.nextElementSibling) {
            newId = currentLiElement.nextElementSibling.getAttribute("data-node-id");
        } else if (currentLiElement.previousElementSibling) {
            newId = currentLiElement.previousElementSibling.getAttribute("data-node-id");
        }
        if (config.group === 1 && !newId) {
            const nextDocElement = currentLiElement.parentElement.nextElementSibling || currentLiElement.parentElement.previousElementSibling.previousElementSibling?.previousElementSibling;
            if (nextDocElement) {
                newId = nextDocElement.nextElementSibling.firstElementChild.getAttribute("data-node-id");
            }
        }
        updateSearchResult(config, element, false, {
            currentId,
            newId
        });
    });
};

const updateConfig = (element: Element, newConfig: Config.IUILayoutTabSearchConfig, config: Config.IUILayoutTabSearchConfig) => {
    if (config.hasReplace !== newConfig.hasReplace) {
        if (newConfig.hasReplace) {
            element.querySelector('[data-type="toggle-replace"]').classList.add("toolbar__icon--active");
            element.querySelector(".toolbar").classList.remove("fn__none");
        } else {
            element.querySelector('[data-type="toggle-replace"]').classList.remove("toolbar__icon--active");
            element.querySelector(".toolbar").classList.add("fn__none");
        }
    }
    const searchPathElement = element.querySelector("#searchPath");
    if (newConfig.hPath) {
        searchPathElement.classList.remove("fn__none");
        searchPathElement.innerHTML = `<div class="b3-chip b3-chip--middle">${escapeHtml(newConfig.hPath)}<svg data-type="remove-path" class="b3-chip__close"><use xlink:href="#iconCloseRound"></use></svg></div>`;
    } else {
        searchPathElement.classList.add("fn__none");
    }
    if (config.group !== newConfig.group) {
        if (newConfig.group === 0) {
            element.querySelector('[data-type="expand"]').classList.add("fn__none");
            element.querySelector('[data-type="contract"]').classList.add("fn__none");
        } else {
            element.querySelector('[data-type="expand"]').classList.remove("fn__none");
            element.querySelector('[data-type="contract"]').classList.remove("fn__none");
        }
    }
    let includeChild = true;
    let enableIncludeChild = false;
    newConfig.idPath.forEach(newConfig => {
        if (newConfig.endsWith(".sy")) {
            includeChild = false;
        }
        if (newConfig.split("/").length > 1) {
            enableIncludeChild = true;
        }
    });
    const searchIncludeElement = element.querySelector('[data-type="include"]');
    if (includeChild) {
        searchIncludeElement.classList.add("toolbar__icon--active");
    } else {
        searchIncludeElement.classList.remove("toolbar__icon--active");
    }
    if (enableIncludeChild) {
        searchIncludeElement.removeAttribute("disabled");
    } else {
        searchIncludeElement.setAttribute("disabled", "disabled");
    }
    (document.querySelector("#toolbarSearch") as HTMLInputElement).value = newConfig.k;
    (element.querySelector("#toolbarReplace") as HTMLInputElement).value = newConfig.r;
    Object.assign(config, newConfig);
    window.siyuan.storage[Constants.LOCAL_SEARCHDATA] = Object.assign({}, config);
    setStorageVal(Constants.LOCAL_SEARCHDATA, window.siyuan.storage[Constants.LOCAL_SEARCHDATA]);
    updateSearchResult(config, element);
    window.siyuan.menus.menu.remove();
};

const onRecentBlocks = (data: IBlock[], config: Config.IUILayoutTabSearchConfig,
                        response?: IWebSocketData, focusId?: {
        currentId?: string,
        newId?: string
    }) => {
    const listElement = document.querySelector("#searchList");
    let resultHTML = "";
    let currentData;
    let newData;
    data.forEach((item: IBlock) => {
        const title = getNotebookName(item.box) + getDisplayName(item.hPath, false);
        if (item.children) {
            resultHTML += `<div class="b3-list-item">
<span class="b3-list-item__toggle b3-list-item__toggle--hl">
    <svg class="b3-list-item__arrow b3-list-item__arrow--open"><use xlink:href="#iconRight"></use></svg>
</span>
${unicode2Emoji(getNotebookIcon(item.box) || window.siyuan.storage[Constants.LOCAL_IMAGES].note, "b3-list-item__graphic", true)}
<span class="b3-list-item__text" style="color: var(--b3-theme-on-surface)">${escapeGreat(title)}</span>
</div><div>`;
            item.children.forEach((childItem) => {
                if (focusId) {
                    if (childItem.id === focusId.currentId) {
                        currentData = childItem;
                    }
                    if (childItem.id === focusId.newId) {
                        newData = childItem;
                    }
                }
                resultHTML += `<div style="padding-left: 36px" data-type="search-item" class="b3-list-item" data-node-id="${childItem.id}">
<svg class="b3-list-item__graphic"><use xlink:href="#${getIconByType(childItem.type)}"></use></svg>
${unicode2Emoji(childItem.ial.icon, "b3-list-item__graphic", true)}
<span class="b3-list-item__text">${childItem.content}</span>
${childItem.tag ? `<span class="b3-list-item__meta b3-list-item__meta--ellipsis">${childItem.tag.split("# #").map(tag => `${tag.replace("#", "")}`).join(" ").replace("#", "")}</span>` : ""}
</div>`;
            });
            resultHTML += "</div>";
        } else {
            if (focusId) {
                if (item.id === focusId.currentId) {
                    currentData = item;
                }
                if (item.id === focusId.newId) {
                    newData = item;
                }
            }
            resultHTML += `<div class="b3-list-item b3-list-item--two" data-type="search-item" data-node-id="${item.id}">
    <div class="b3-list-item__first">
        <svg class="b3-list-item__graphic"><use xlink:href="#${getIconByType(item.type)}"></use></svg>
        ${unicode2Emoji(item.ial.icon, "b3-list-item__graphic", true)}
        <span class="b3-list-item__text">${item.content}</span>
    </div>
    <div class="fn__flex">
        ${item.tag ? `<span class="b3-list-item__meta b3-list-item__meta--ellipsis">${item.tag.split("# #").map(tag => `${tag.replace("#", "")}`).join(" ").replace("#", "")}</span><span class="fn__space"></span>` : ""}
        <span class="b3-list-item__text b3-list-item__meta">${escapeGreat(title)}</span>
    </div>
</div>`;
        }
    });
    listElement.innerHTML = resultHTML ||
        `<div class="b3-list-item b3-list-item--focus" data-type="search-new">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconFile"></use></svg>
    <span class="b3-list-item__text">
        ${window.siyuan.languages.newFile} <mark>${(document.querySelector("#toolbarSearch") as HTMLInputElement).value}</mark>
    </span>
</div>`;
    listElement.scrollTop = 0;
    let countHTML = "";
    if (response) {
        let text = window.siyuan.languages.findInDoc.replace("${x}", response.data.matchedRootCount).replace("${y}", response.data.matchedBlockCount);
        if (response.data.docMode) {
            text = window.siyuan.languages.matchDoc.replace("${x}", response.data.matchedRootCount);
        }
        countHTML = `<span class="fn__flex-center">${text}</span>
<span class="fn__flex-1"></span>
<span class="fn__flex-center">${config.page}/${response.data.pageCount || 1}</span>`;
    }
    listElement.previousElementSibling.querySelector('[data-type="result"]').innerHTML = countHTML;
    if (!currentData) {
        currentData = newData;
    }
    if (!currentData && data.length > 0) {
        if (data[0].children) {
            currentData = data[0].children[0];
        } else {
            currentData = data[0];
        }
    }
    if (currentData) {
        const currentList = listElement.querySelector(`[data-node-id="${currentData.id}"]`) as HTMLElement;
        if (currentList) {
            currentList.classList.add("b3-list-item--focus");
            currentList.scrollIntoView();
        }
    }
};

let toolbarSearchTimeout = 0;
export const updateSearchResult = (config: Config.IUILayoutTabSearchConfig, element: Element, rmCurrentCriteria = false,
                                   focusId?: {
                                       currentId?: string,
                                       newId?: string
                                   }) => {
    clearTimeout(toolbarSearchTimeout);
    toolbarSearchTimeout = window.setTimeout(() => {
        if (rmCurrentCriteria) {
            element.querySelector("#criteria .b3-chip--current")?.classList.remove("b3-chip--current");
        }
        const loadingElement = element.querySelector(".fn__loading--top");
        loadingElement.classList.remove("fn__none");
        const previousElement = element.querySelector('[data-type="previous"]');
        const nextElement = element.querySelector('[data-type="next"]');
        const inputElement = document.getElementById("toolbarSearch") as HTMLInputElement;
        config.query = inputElement.value;
        if (config.query === "" && (!config.idPath || config.idPath.length === 0)) {
            fetchPost("/api/block/getRecentUpdatedBlocks", {}, (response) => {
                onRecentBlocks(response.data, config, undefined, focusId);
                loadingElement.classList.add("fn__none");
                previousElement.setAttribute("disabled", "true");
                nextElement.setAttribute("disabled", "true");
            });
        } else {
            if (!config.page) {
                config.page = 1;
            }
            if (config.page > 1) {
                previousElement.removeAttribute("disabled");
            } else {
                previousElement.setAttribute("disabled", "disabled");
            }
            fetchPost("/api/search/fullTextSearchBlock", {
                query: config.query,
                method: config.method,
                types: config.types,
                paths: config.idPath || [],
                groupBy: config.group,
                orderBy: config.sort,
                page: config.page,
            }, (response) => {
                onRecentBlocks(response.data.blocks, config, response, focusId);
                loadingElement.classList.add("fn__none");
                if (config.page < response.data.pageCount) {
                    nextElement.removeAttribute("disabled");
                } else {
                    nextElement.setAttribute("disabled", "disabled");
                }
            });
        }
    }, Constants.TIMEOUT_INPUT);
};

const initSearchEvent = (app: App, element: Element, config: Config.IUILayoutTabSearchConfig) => {
    const searchInputElement = document.getElementById("toolbarSearch") as HTMLInputElement;
    searchInputElement.value = config.k || "";
    searchInputElement.addEventListener("compositionend", (event: InputEvent) => {
        if (event && event.isComposing) {
            return;
        }
        config.page = 1;
        updateSearchResult(config, element, true);
    });
    searchInputElement.addEventListener("input", (event: InputEvent) => {
        if (event && event.isComposing) {
            return;
        }
        config.page = 1;
        updateSearchResult(config, element, true);
    });
    searchInputElement.addEventListener("blur", () => {
        if (config.removed) {
            config.k = searchInputElement.value;
            window.siyuan.storage[Constants.LOCAL_SEARCHDATA] = Object.assign({}, config);
            setStorageVal(Constants.LOCAL_SEARCHDATA, window.siyuan.storage[Constants.LOCAL_SEARCHDATA]);
        }
        saveKeyList("keys", searchInputElement.value);
    });
    addClearButton({
        inputElement: searchInputElement,
        className: "toolbar__icon",
        clearCB() {
            config.page = 1;
            updateSearchResult(config, element);
        }
    });
    const replaceInputElement = element.querySelector(".toolbar .toolbar__title") as HTMLInputElement;
    replaceInputElement.value = config.r || "";
    addClearButton({
        inputElement: replaceInputElement,
        className: "toolbar__icon",
    });
    const criteriaData: Config.IUILayoutTabSearchConfig[] = [];
    initCriteriaMenu(element.querySelector("#criteria"), criteriaData, config);

    const assetsElement = document.querySelector("#searchAssetsPanel");
    const unRefElement = document.querySelector("#searchUnRefPanel");
    const searchListElement = element.querySelector("#searchList") as HTMLElement;
    const localSearch = window.siyuan.storage[Constants.LOCAL_SEARCHASSET] as ISearchAssetOption;
    element.addEventListener("click", (event: MouseEvent) => {
        let target = event.target as HTMLElement;
        while (target && !target.isSameNode(element)) {
            const type = target.getAttribute("data-type");
            if (type === "replaceHistory") {
                toggleReplaceHistory(target.nextElementSibling as HTMLInputElement);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "assetHistory") {
                toggleAssetHistory(assetsElement);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "previous") {
                if (!target.getAttribute("disabled")) {
                    config.page--;
                    updateSearchResult(config, element);
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "next") {
                if (!target.getAttribute("disabled")) {
                    config.page++;
                    updateSearchResult(config, element);
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "set-criteria") {
                config.removed = false;
                target.parentElement.querySelector(".b3-chip--current")?.classList.remove("b3-chip--current");
                target.classList.add("b3-chip--current");
                criteriaData.find(item => {
                    if (item.name === target.innerText.trim()) {
                        updateConfig(element, item, config);
                        return true;
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "remove-criteria") {
                const name = target.parentElement.innerText.trim();
                fetchPost("/api/storage/removeCriterion", {name});
                criteriaData.find((item, index) => {
                    if (item.name === name) {
                        criteriaData.splice(index, 1);
                        return true;
                    }
                });
                if (target.parentElement.classList.contains("b3-chip--current")) {
                    updateConfig(element, {
                        removed: true,
                        sort: 0,
                        group: 0,
                        hasReplace: false,
                        method: 0,
                        hPath: "",
                        idPath: [],
                        k: "",
                        r: "",
                        page: 1,
                        types: getDefaultType(),
                        replaceTypes: Object.assign({}, Constants.SIYUAN_DEFAULT_REPLACETYPES),
                    }, config);
                }
                if (target.parentElement.parentElement.childElementCount === 1) {
                    target.parentElement.parentElement.classList.add("fn__none");
                }
                target.parentElement.remove();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "remove-path") {
                config.idPath = [];
                config.hPath = "";
                element.querySelector("#searchPath").classList.add("fn__none");
                config.page = 1;
                updateSearchResult(config, element, true);
                const includeElement = element.querySelector('[data-type="include"]');
                includeElement.classList.remove("toolbar__icon--active");
                includeElement.setAttribute("disabled", "disabled");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "expand") {
                Array.from(searchListElement.children).forEach(item => {
                    if (item.classList.contains("b3-list-item")) {
                        item.querySelector(".b3-list-item__arrow").classList.add("b3-list-item__arrow--open");
                        item.nextElementSibling.classList.remove("fn__none");
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "contract") {
                Array.from(searchListElement.children).forEach(item => {
                    if (item.classList.contains("b3-list-item")) {
                        item.querySelector(".b3-list-item__arrow").classList.remove("b3-list-item__arrow--open");
                        item.nextElementSibling.classList.add("fn__none");
                    }
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "currentPath" && !target.hasAttribute("disabled")) {
                const editProtyle = getCurrentEditor().protyle;
                fetchPost("/api/filetree/getHPathsByPaths", {paths: [editProtyle.path]}, (response) => {
                    config.idPath = [pathPosix().join(editProtyle.notebookId, editProtyle.path)];
                    config.hPath = response.data[0];
                    const searchPathElement = element.querySelector("#searchPath");
                    searchPathElement.classList.remove("fn__none");
                    searchPathElement.innerHTML = `<div class="b3-chip b3-chip--middle">${escapeHtml(config.hPath)}<svg data-type="remove-path" class="b3-chip__close"><use xlink:href="#iconCloseRound"></use></svg></div>`;

                    const includeElement = element.querySelector('[data-type="include"]');
                    includeElement.classList.remove("toolbar__icon--active");
                    includeElement.removeAttribute("disabled");
                    config.page = 1;
                    updateSearchResult(config, element, true);
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "path") {
                movePathTo((toPath, toNotebook) => {
                    fetchPost("/api/filetree/getHPathsByPaths", {paths: toPath}, (response) => {
                        config.idPath = [];
                        const hPathList: string[] = [];
                        let enableIncludeChild = false;
                        toPath.forEach((item, index) => {
                            if (item === "/") {
                                config.idPath.push(toNotebook[index]);
                                hPathList.push(getNotebookName(toNotebook[index]));
                            } else {
                                enableIncludeChild = true;
                                config.idPath.push(pathPosix().join(toNotebook[index], item.replace(".sy", "")));
                            }
                        });
                        if (response.data) {
                            hPathList.push(...response.data);
                        }
                        config.hPath = hPathList.join(" ");

                        const searchPathElement = element.querySelector("#searchPath");
                        searchPathElement.classList.remove("fn__none");
                        searchPathElement.innerHTML = `<div class="b3-chip b3-chip--middle">${escapeHtml(config.hPath)}<svg data-type="remove-path" class="b3-chip__close"><use xlink:href="#iconCloseRound"></use></svg></div>`;

                        const includeElement = element.querySelector('[data-type="include"]');
                        includeElement.classList.add("toolbar__icon--active");
                        if (enableIncludeChild) {
                            includeElement.removeAttribute("disabled");
                        } else {
                            includeElement.setAttribute("disabled", "disabled");
                        }
                        config.page = 1;
                        updateSearchResult(config, element, true);
                    });
                }, [], undefined, window.siyuan.languages.specifyPath);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "include" && !target.hasAttribute("disabled")) {
                target.classList.toggle("toolbar__icon--active");
                if (target.classList.contains("toolbar__icon--active")) {
                    config.idPath.forEach((item, index) => {
                        if (item.endsWith(".sy")) {
                            config.idPath[index] = item.replace(".sy", "");
                        }
                    });
                } else {
                    config.idPath.forEach((item, index) => {
                        if (!item.endsWith(".sy") && item.split("/").length > 1) {
                            config.idPath[index] = item + ".sy";
                        }
                    });
                }
                config.page = 1;
                updateSearchResult(config, element, true);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "toggle-replace") {
                config.hasReplace = !config.hasReplace;
                replaceInputElement.parentElement.classList.toggle("fn__none");
                target.classList.toggle("toolbar__icon--active");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "more") {
                moreMenu(config, criteriaData, element, () => {
                    config.page = 1;
                    updateSearchResult(config, element, true);
                }, () => {
                    updateConfig(element, {
                        removed: true,
                        sort: 0,
                        group: 0,
                        hasReplace: false,
                        method: 0,
                        hPath: "",
                        idPath: [],
                        k: "",
                        r: "",
                        page: 1,
                        types: getDefaultType(),
                        replaceTypes: Object.assign({}, Constants.SIYUAN_DEFAULT_REPLACETYPES),
                    }, config);
                });
                window.siyuan.menus.menu.fullscreen();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "replace-all") {
                replace(element, config, true);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "refreshUnRef") {
                getUnRefListMobile(unRefElement);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "unRefPrevious") {
                if (!target.getAttribute("disabled")) {
                    let currentPage = parseInt(unRefElement.querySelector("#searchUnRefResult").lastElementChild.textContent);
                    if (currentPage > 1) {
                        currentPage--;
                        getUnRefListMobile(unRefElement, currentPage);
                    }
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "unRefNext") {
                const unRefRageElement = unRefElement.querySelector("#searchUnRefResult").lastElementChild;
                let currentPage = parseInt(unRefRageElement.textContent);
                if (currentPage < parseInt(unRefRageElement.textContent.split("/")[1])) {
                    currentPage++;
                    getUnRefListMobile(unRefElement, currentPage);
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "queryAsset") {
                assetMethodMenu(target, () => {
                    assetInputEvent(assetsElement, localSearch);
                    setStorageVal(Constants.LOCAL_SEARCHASSET, localSearch);
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "filterAsset") {
                assetFilterMenu(assetsElement);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "moreAsset") {
                assetMoreMenu(target, assetsElement, () => {
                    assetInputEvent(assetsElement);
                    setStorageVal(Constants.LOCAL_SEARCHASSET, localSearch);
                });
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "goAsset") {
                goAsset();
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "goSearch") {
                assetsElement.classList.add("fn__none");
                unRefElement.classList.add("fn__none");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "assetPrevious") {
                if (!target.getAttribute("disabled")) {
                    assetInputEvent(assetsElement, localSearch, parseInt(assetsElement.querySelector("#searchAssetResult .fn__flex-center").textContent.split("/")[1]) - 1);
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "assetNext") {
                if (!target.getAttribute("disabled")) {
                    assetInputEvent(assetsElement, localSearch, parseInt(assetsElement.querySelector("#searchAssetResult .fn__flex-center").textContent.split("/")[1]) + 1);
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (type === "replace") {
                replace(element, config, false);
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("b3-list-item__toggle")) {
                target.parentElement.nextElementSibling.classList.toggle("fn__none");
                target.firstElementChild.classList.toggle("b3-list-item__arrow--open");
                event.stopPropagation();
                event.preventDefault();
                break;
            } else if (target.classList.contains("b3-list-item")) {
                if (target.getAttribute("data-type") === "search-new") {
                    newFileByName(app, searchInputElement.value);
                } else if (target.getAttribute("data-type") === "search-item") {
                    const id = target.getAttribute("data-node-id");
                    if (id) {
                        if (window.siyuan.mobile.editor?.protyle) {
                            preventScroll(window.siyuan.mobile.editor.protyle);
                        }
                        checkFold(id, (zoomIn) => {
                            openMobileFileById(app, id, zoomIn ? [Constants.CB_GET_ALL] : [Constants.CB_GET_HL, Constants.CB_GET_CONTEXT, Constants.CB_GET_ROOTSCROLL]);
                        });
                        closePanel();
                    } else {
                        if (!target.classList.contains("b3-list-item--focus")) {
                            element.querySelector("#searchAssetList .b3-list-item--focus").classList.remove("b3-list-item--focus");
                            target.classList.add("b3-list-item--focus");
                            renderPreview(element.querySelector("#searchAssetPreview"), target.dataset.id, (element.querySelector("#searchAssetInput") as HTMLInputElement).value, window.siyuan.storage[Constants.LOCAL_SEARCHASSET].method);
                        } else if (target.classList.contains("b3-list-item--focus")) {
                            renderNextAssetMark(element.querySelector("#searchAssetPreview"));
                        }
                    }
                } else if (target.querySelector(".b3-list-item__toggle")) {
                    target.nextElementSibling.classList.toggle("fn__none");
                    target.firstElementChild.firstElementChild.classList.toggle("b3-list-item__arrow--open");
                }
                event.stopPropagation();
                event.preventDefault();
                break;
            }
            target = target.parentElement;
        }
    }, false);
};

export const popSearch = (app: App, searchConfig?: any) => {
    const config: Config.IUILayoutTabSearchConfig = JSON.parse(JSON.stringify(window.siyuan.storage[Constants.LOCAL_SEARCHDATA]));
    const rangeText = (getCurrentEditor()?.protyle.toolbar.range || (getSelection().rangeCount > 0 ? getSelection().getRangeAt(0) : document.createRange())).toString();
    if (rangeText) {
        config.k = rangeText;
    }
    if (searchConfig) {
        Object.keys(searchConfig).forEach((key: "r") => {
            config[key] = searchConfig[key];
        });
    }

    activeBlur();
    let includeChild = true;
    let enableIncludeChild = false;
    config.idPath.forEach(item => {
        if (item.endsWith(".sy")) {
            includeChild = false;
        }
        if (item.split("/").length > 1) {
            enableIncludeChild = true;
        }
    });

    openModel({
        title: `<div class="fn__flex">
    <span data-menu="true" class="toolbar__icon toolbar__icon--history" data-type="history">
        <svg class="svg--mid"><use xlink:href="#iconSearch"></use></svg>
        <svg class="svg--smaller"><use xlink:href="#iconDown"></use></svg>
    </span>
    <input id="toolbarSearch" placeholder="${window.siyuan.languages.showRecentUpdatedBlocks}" class="toolbar__title fn__block">
    <svg id="toolbarSearchNew" class="toolbar__icon"><use xlink:href="#iconFile"></use></svg>
</div>`,
        html: `<div class="fn__flex-column" style="height: 100%">
    <div class="toolbar toolbar--border${config.hasReplace ? "" : " fn__none"}">
        <span data-menu="true" class="toolbar__icon toolbar__icon--history" data-type="replaceHistory">
            <svg class="svg--mid"><use xlink:href="#iconReplace"></use></svg>
            <svg class="svg--smaller"><use xlink:href="#iconDown"></use></svg>
        </span>
        <input id="toolbarReplace" class="toolbar__title">
        <svg class="fn__rotate fn__none toolbar__icon"><use xlink:href="#iconRefresh"></use></svg>
        <div class="fn__space"></div>
        <button data-type="replace-all" class="b3-button b3-button--outline fn__flex-center">${window.siyuan.languages.replaceAll}</button>
        <div class="fn__space"></div>
        <button data-type="replace" class="b3-button b3-button--outline fn__flex-center">${window.siyuan.languages.replace}</button>
        <div class="fn__space"></div>
    </div>
    <div id="criteria" style="background-color: var(--b3-theme-background);"></div>
    <div class="toolbar">
        <span class="fn__space"></span>
        <span data-type="result" class="fn__flex-1 fn__flex"></span>
        <span class="fn__space"></span>
        <svg data-type="previous" disabled="disabled" class="toolbar__icon"><use xlink:href="#iconLeft"></use></svg>
        <svg data-type="next" disabled="disabled" class="toolbar__icon"><use xlink:href="#iconRight"></use></svg>
    </div>
    <div id="searchList" style="overflow:auto;" class="fn__flex-1 b3-list b3-list--background"></div>
    <div id="searchPath" class="b3-chips${config.hPath ? "" : " fn__none"}" style="background-color: var(--b3-theme-background);">
        <div class="b3-chip b3-chip--middle">
            ${escapeHtml(config.hPath)}
            <svg data-type="remove-path" class="b3-chip__close"><use xlink:href="#iconCloseRound"></use></svg>
        </div>
    </div>
    <div class="toolbar">
        <span class="fn__flex-1"></span>
        <svg data-type="toggle-replace" class="toolbar__icon${config.hasReplace ? " toolbar__icon--active" : ""}"><use xlink:href="#iconReplace"></use></svg>
        <svg ${enableIncludeChild ? "" : "disabled"} data-type="include" class="toolbar__icon${includeChild ? " toolbar__icon--active" : ""}"><use xlink:href="#iconCopy"></use></svg>
        <svg data-type="path" class="toolbar__icon"><use xlink:href="#iconFolder"></use></svg>
        <svg ${document.querySelector("#empty").classList.contains("fn__none") ? "" : "disabled"} data-type="currentPath" class="toolbar__icon"><use xlink:href="#iconFocus"></use></svg>
        <svg data-type="expand" class="toolbar__icon${config.group === 0 ? " fn__none" : ""}"><use xlink:href="#iconExpand"></use></svg>
        <svg data-type="contract" class="toolbar__icon${config.group === 0 ? " fn__none" : ""}"><use xlink:href="#iconContract"></use></svg>
        <svg data-type="more" class="toolbar__icon"><use xlink:href="#iconMore"></use></svg>
        <svg data-type="goAsset" class="toolbar__icon"><use xlink:href="#iconExact"></use></svg>
        <span class="fn__flex-1"></span>
     </div>
     <div class="fn__none fn__flex-column" style="position: fixed;top: 0;width: 100%;background: var(--b3-theme-surface);height: 100%;" id="searchAssetsPanel">
        <div class="toolbar toolbar--border">
           <span data-menu="true" class="toolbar__icon toolbar__icon--history" data-type="assetHistory">
                <svg class="svg--mid"><use xlink:href="#iconSearch"></use></svg>
                <svg class="svg--smaller"><use xlink:href="#iconDown"></use></svg>
            </span>
            <input id="searchAssetInput" placeholder="${window.siyuan.languages.keyword}" class="toolbar__title fn__block">
        </div>
        <div class="toolbar">
            <span class="fn__space"></span>
            <span id="searchAssetResult" class="fn__flex-1 fn__flex"><span class="fn__flex-1"></span></span>
            <span class="fn__space"></span>
            <svg data-type="assetPrevious" disabled="disabled" class="toolbar__icon"><use xlink:href="#iconLeft"></use></svg>
            <svg data-type="assetNext" disabled="disabled" class="toolbar__icon"><use xlink:href="#iconRight"></use></svg>
        </div>
        <div id="searchAssetList" style="overflow:auto;" class="fn__flex-1 b3-list b3-list--background"></div>
        <div id="searchAssetPreview" class="fn__flex-1 search__preview b3-typography" style="padding: 8px;border-bottom: 1px solid var(--b3-border-color);"></div>
        <div class="toolbar">
            <span class="fn__flex-1"></span>
            <svg data-type="queryAsset" class="toolbar__icon"><use xlink:href="#iconRegex"></use></svg>
            <svg data-type="filterAsset" class="toolbar__icon"><use xlink:href="#iconFilter"></use></svg>
            <svg data-type="moreAsset" class="toolbar__icon"><use xlink:href="#iconMore"></use></svg>
            <svg data-type="goSearch" class="toolbar__icon"><use xlink:href="#iconBack"></use></svg>
            <span class="fn__flex-1"></span>
         </div>
    </div>
     <div class="fn__none fn__flex-column" style="position: fixed;top: 0;width: 100%;background: var(--b3-theme-surface);height: 100%;" id="searchUnRefPanel">
        <div class="toolbar">
            <span class="fn__space"></span>
            <span id="searchUnRefResult" class="fn__flex-1 fn__flex"></span>
            <span class="fn__space"></span>
            <svg data-type="unRefPrevious" disabled="disabled" class="toolbar__icon"><use xlink:href="#iconLeft"></use></svg>
            <svg data-type="unRefNext" disabled="disabled" class="toolbar__icon"><use xlink:href="#iconRight"></use></svg>
        </div>
        <div id="searchUnRefList" style="overflow:auto;" class="fn__flex-1 b3-list b3-list--background"></div>
        <div class="toolbar">
            <span class="fn__flex-1"></span>
            <svg data-type="refreshUnRef" class="toolbar__icon"><use xlink:href="#iconRefresh"></use></svg>
            <svg data-type="goSearch" class="toolbar__icon"><use xlink:href="#iconBack"></use></svg>
            <span class="fn__flex-1"></span>
         </div>
    </div>
     <div class="fn__loading fn__loading--top"><img width="120px" src="/stage/loading-pure.svg"></div>
</div>`,
        bindEvent(element) {
            document.querySelector("#toolbarSearchNew").addEventListener("click", () => {
                newFileByName(app, (document.querySelector("#toolbarSearch") as HTMLInputElement).value);
            });
            const historyElement = document.querySelector('.toolbar [data-type="history"]');
            historyElement.addEventListener("click", () => {
                toggleSearchHistory(document.querySelector("#model"), config, undefined);
            });
            initSearchEvent(app, element.firstElementChild, config);
            updateSearchResult(config, element);
        }
    });
};

const goAsset = () => {
    const assetsElement = document.querySelector("#searchAssetsPanel");
    assetsElement.classList.remove("fn__none");
    const listElement = assetsElement.querySelector("#searchAssetList");
    if (listElement.innerHTML) {
        return;
    }
    const localSearch = window.siyuan.storage[Constants.LOCAL_SEARCHASSET] as ISearchAssetOption;
    const inputElement = assetsElement.querySelector("input");
    inputElement.value = localSearch.k;
    inputElement.addEventListener("compositionend", (event: InputEvent) => {
        if (event.isComposing) {
            return;
        }
        assetInputEvent(assetsElement, localSearch);
    });
    inputElement.addEventListener("input", (event: InputEvent) => {
        if (event.isComposing) {
            return;
        }
        assetInputEvent(assetsElement, localSearch);
    });
    inputElement.addEventListener("blur", () => {
        saveAssetKeyList(inputElement);
    });
    assetInputEvent(assetsElement, localSearch);
    addClearButton({
        inputElement,
        className: "toolbar__icon",
        clearCB() {
            assetInputEvent(assetsElement, localSearch);
        }
    });
};

export const goUnRef = () => {
    window.siyuan.menus.menu.remove();
    const unRefElement = document.querySelector("#searchUnRefPanel");
    unRefElement.classList.remove("fn__none");
    const listElement = unRefElement.querySelector("#searchUnRefList");
    if (listElement.innerHTML) {
        return;
    }
    getUnRefListMobile(unRefElement);
};

const getUnRefListMobile = (element: Element, page = 1) => {
    const previousElement = element.querySelector('[data-type="unRefPrevious"]');
    if (page > 1) {
        previousElement.removeAttribute("disabled");
    } else {
        previousElement.setAttribute("disabled", "disabled");
    }
    fetchPost("/api/search/listInvalidBlockRefs", {
        page,
    }, (response) => {
        element.parentElement.querySelector(".fn__loading--top").classList.add("fn__none");
        const nextElement = element.querySelector('[data-type="unRefNext"]');
        if (page < response.data.pageCount) {
            nextElement.removeAttribute("disabled");
        } else {
            nextElement.setAttribute("disabled", "disabled");
        }
        let resultHTML = "";
        response.data.blocks.forEach((item: IBlock, index: number) => {
            const title = getNotebookName(item.box) + getDisplayName(item.hPath, false);
            resultHTML += `<div class="b3-list-item b3-list-item--two${index === 0 ? " b3-list-item--focus" : ""}" data-type="search-item" data-node-id="${item.id}">
<div class="b3-list-item__first">
    <svg class="b3-list-item__graphic"><use xlink:href="#${getIconByType(item.type)}"></use></svg>
    ${unicode2Emoji(item.ial.icon, "b3-list-item__graphic", true)}
    <span class="b3-list-item__text">${item.content}</span>
</div>
<span class="b3-list-item__text b3-list-item__meta">${escapeGreat(title)}</span>
</div>`;
        });
        element.querySelector("#searchUnRefResult").innerHTML = `<span class="fn__flex-center">${window.siyuan.languages.findInDoc.replace("${x}", response.data.matchedRootCount).replace("${y}", response.data.matchedBlockCount)}</span>
<span class="fn__flex-1"></span>
<span class="fn__flex-center">${page}/${response.data.pageCount || 1}</span>`;
        element.querySelector("#searchUnRefList").innerHTML = resultHTML || `<div class="search__empty">
    ${window.siyuan.languages.emptyContent}
</div>`;
    });
};
